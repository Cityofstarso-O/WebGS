import { GlobalVar } from "./Global.js";

class PlyLoader {
    static AlignUp(a, aligment) {
        return Math.floor((a + aligment - 1) / aligment) * aligment;
    }
    static RoundUp(a, b) {
        return Math.ceil((a + b - 1) / b);
    }
    constructor(device_) {
        this.device = device_;

        this.stagingBuffer = null;  // offset[60] | points[59 * num]
        this.plyBuffer = null;
        this.size = 0;
        this.offsets_size = 0;
        this.ply_size = 0;

        this.bindGroupLayout = null;
        this.bindGroup = null;

        this.newPlyReady = false;
        this.newPtReady = false;
        this.ifRecreateBuffer = false;

        this.pointCount = 0;
        this.ply_offsets = new Uint32Array(60);
        this.offset = 0;
        this.updatePlyOffsets_Func = {
            MODE_3DGS: this.updatePlyoffsets_3DGS.bind(this),
            MODE_SpaceTime_FULL: this.updatePlyoffsets_SpaceTime_FULL.bind(this),
            MODE_SpaceTime_LITE: this.updatePlyoffsets_SpaceTime_LITE.bind(this),
        }

        this.dynamicStorageAlignment = this.device.limits.minStorageBufferOffsetAlignment;


        this.bindGroupLayout = this.device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: 'read-only-storage', },
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: 'read-only-storage', },
                },
            ],
        });
    }

    recreateBuffer() {
        this.offsets_size = PlyLoader.AlignUp(this.ply_offsets.length * 4, this.dynamicStorageAlignment);
        this.ply_size = this.offset * this.pointCount;
        this.size = this.offsets_size + this.ply_size;
        let min_create_size = Math.max(this.size, 60 * 4 * 1000000);
        if (this.stagingBuffer === null || this.stagingBuffer.size < min_create_size) {
            if (this.stagingBuffer) {
                this.stagingBuffer.destory();
            }
            this.stagingBuffer = this.device.createBuffer(
                { size: min_create_size, usage: GPUBufferUsage.MAP_WRITE | GPUBufferUsage.COPY_SRC }
            );
            this.ifRecreateBuffer = true;
        }

        if (this.plyBuffer === null || this.plyBuffer.size < min_create_size) {
            if (this.plyBuffer) {
                this.plyBuffer.destory();
            }
            this.plyBuffer = this.device.createBuffer(
                { size: min_create_size, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST }
            );
            this.ifRecreateBuffer = true;
        }
        console.log(`recreate staging buffer and ply buffer with size ${min_create_size}`);
        this.recreateBindGroup();
    }

    recreateBindGroup() {
        if (this.ifRecreateBuffer) {
            /*if (this.bindGroup) {
                this.bindGroup.destory();
            }*/
            this.bindGroup = this.device.createBindGroup({
                layout: this.bindGroupLayout,
                entries: [
                    {
                        binding: 0, // offsets
                        resource: {
                            buffer: this.plyBuffer,
                            offset: 0,
                            size: this.offsets_size,
                        },
                    },
                    {
                        binding: 1, // ply
                        resource: {
                            buffer: this.plyBuffer,
                            offset: this.offsets_size,
                            size: this.ply_size,
                        },
                    },
                ],
            });
            console.log(`recreate PlyLoader.bindGroup`);
        }
    }

    handleFiles(files) {
        if (files.length > 0) {
            let pPly = -1;
            let pPt = -1;
            for (let i = 0; i < files.length; i++) {
                const fileName = files[i].name.toLowerCase();
                const fileExtension = fileName.substring(fileName.lastIndexOf('.') + 1);
                if (fileExtension === 'ply' && pPly === -1) {
                    pPly = i;
                } else if (fileExtension === 'pt' && pPt === -1) {
                    pPt = i;
                }
                if (pPly !== -1 && pPt !== -1) {
                    break;
                }
            }

            if (pPly >= 0) {   // read PLY
                console.log("loading ply file: " + files[pPly].name);
                const reader = new FileReader();
                reader.onload = async (e) => {
                    const content = e.target.result;
                    try {
                        await this.parsePLYFile(content);
                        this.newPlyReady = true;
                    } catch (error) {
                        this.newPlyReady = false;
                        console.error('Error parsing PLY file:', error);
                    }
                };
                reader.onerror = (e) => {
                    console.error('Error parsing PLY file:', error);
                };
                reader.readAsArrayBuffer(files[pPly]);
            }
            if (pPt >= 0) {  // read PT
                console.log("loading pt file: " + files[pPt].name);
                const reader = new FileReader();
                reader.onload = async (e) => {
                    const content = e.target.result;
                    try {
                        await this.parsePTFile(content);
                        this.newPtReady = true;
                    } catch (error) {
                        this.newPtReady = false;
                        console.error('Error parsing PT file:', error);
                    }
                };
                reader.onerror = (e) => {
                    console.error('Error parsing PT file:', error);
                };
                reader.readAsArrayBuffer(files[pPt]);
            }
        }
    }

    async parsePLYFile(arrayBuffer) {
        const start = performance.now();
        const contentStart = new TextDecoder('utf-8').decode(arrayBuffer.slice(0, 2000));
        const headerEnd = contentStart.indexOf('end_header') + 'end_header'.length + 1;
        const [header] = contentStart.split('end_header');

        this.parseHeader(header);
        if (this.pointCount > GlobalVar.MAX_SPLAT_COUNT) {
            throw new Error(`point count ${this.pointCount} is bigger than MAX_SPLAT_COUNT = 2**23`);
        } else if (this.pointCount <= 0) {
            throw new Error(`point count ${this.pointCount} is less or equal to zero`);
        }
        console.log(`headerEnd ${headerEnd} `);
        const floatArray = this.parseBinaryData(arrayBuffer, headerEnd);

        this.recreateBuffer();

        await this.stagingBuffer.mapAsync(GPUMapMode.WRITE);
        const mappedData0 = new Uint32Array(this.stagingBuffer.getMappedRange(0, this.ply_offsets.length * 4));
        mappedData0.set(this.ply_offsets);
        this.stagingBuffer.unmap();

        await this.stagingBuffer.mapAsync(GPUMapMode.WRITE);
        const mappedData1 = new Float32Array(this.stagingBuffer.getMappedRange(this.offsets_size, this.offset * this.pointCount));
        mappedData1.set(floatArray);
        this.stagingBuffer.unmap();

        const end = performance.now();
        console.log(`[${(end-start).toFixed(1)}ms] successfully load ply file \npoint ${this.pointCount}\nproperty ${this.offset/4}`);
    }

    gpuCopy(commandEncoder) {
        commandEncoder.copyBufferToBuffer(this.stagingBuffer, 0, this.plyBuffer, 0, this.size);
    }

    parseHeader(text) {
        const lines = text.split('\n');
        const offsets = new Map();
        this.offset = 0;

        for (const line of lines) {
            if (line.trim() === "end_header") {
                break;
            }

            const words = line.split(/\s+/);
            const word = words[0];

            if (word === "property") {
                const type = words[1];
                const property = words[2];
                let size = 0;
                if (type === "float") {
                    size = 4;
                }
                offsets.set(property, this.offset);
                this.offset += size;
            } else if (word === "element") {
                const type = words[1];
                const count = parseInt(words[2], 10);

                if (type === "vertex") {
                    this.pointCount = count;
                }
            } else if (word === "format") {
                if (words[1] !== "binary_little_endian") {
                    throw new Error("ply file only supports binary_little_endian");
                }
            }
        }

        this.updatePlyOffsets_Func[GlobalVar.MODE](offsets);
    }

    updatePlyoffsets_3DGS(offsets) {
        this.ply_offsets[0] = (offsets.get("x") / 4)>>>0;
        this.ply_offsets[1] = (offsets.get("y") / 4)>>>0;
        this.ply_offsets[2] = (offsets.get("z") / 4)>>>0;
        this.ply_offsets[3] = (offsets.get("scale_0") / 4)>>>0;
        this.ply_offsets[4] = (offsets.get("scale_1") / 4)>>>0;
        this.ply_offsets[5] = (offsets.get("scale_2") / 4)>>>0;
        this.ply_offsets[6] = (offsets.get("rot_1") / 4)>>>0;
        this.ply_offsets[7] = (offsets.get("rot_2") / 4)>>>0;
        this.ply_offsets[8] = (offsets.get("rot_3") / 4)>>>0;
        this.ply_offsets[9] = (offsets.get("rot_0") / 4)>>>0;
        this.ply_offsets[10 + 0] = (offsets.get("f_dc_0") / 4)>>>0;
        this.ply_offsets[10 + 16] = (offsets.get("f_dc_1") / 4)>>>0;
        this.ply_offsets[10 + 32] = (offsets.get("f_dc_2") / 4)>>>0;
        for (let i = 0; i < 15; ++i) {
            this.ply_offsets[10 + 1 + i] =  (offsets.get("f_rest_" + (i)) / 4)>>>0;
            this.ply_offsets[10 + 17 + i] = (offsets.get("f_rest_" + (15 + i)) / 4)>>>0;
            this.ply_offsets[10 + 33 + i] = (offsets.get("f_rest_" + (30 + i)) / 4)>>>0;
        }
        this.ply_offsets[58] = (offsets.get("opacity") / 4)>>>0;
        this.ply_offsets[59] = (this.offset / 4)>>>0;
    }

    updatePlyoffsets_SpaceTime_FULL(offsets) {
        this.ply_offsets[0] = (offsets.get("x") / 4)>>>0;
        this.ply_offsets[1] = (offsets.get("y") / 4)>>>0;
        this.ply_offsets[2] = (offsets.get("z") / 4)>>>0;
        this.ply_offsets[3] = (offsets.get("scale_0") / 4)>>>0;
        this.ply_offsets[4] = (offsets.get("scale_1") / 4)>>>0;
        this.ply_offsets[5] = (offsets.get("scale_2") / 4)>>>0;
        this.ply_offsets[6] = (offsets.get("rot_1") / 4)>>>0;
        this.ply_offsets[7] = (offsets.get("rot_2") / 4)>>>0;
        this.ply_offsets[8] = (offsets.get("rot_3") / 4)>>>0;
        this.ply_offsets[9] = (offsets.get("rot_0") / 4)>>>0;
        this.ply_offsets[10 + 0] = (offsets.get("f_dc_0") / 4)>>>0;
        this.ply_offsets[10 + 16] = (offsets.get("f_dc_1") / 4)>>>0;
        this.ply_offsets[10 + 32] = (offsets.get("f_dc_2") / 4)>>>0;
        for (let i = 0; i < 15; ++i) {
            this.ply_offsets[10 + 1 + i] =  (offsets.get("f_rest_" + (i)) / 4)>>>0;
            this.ply_offsets[10 + 17 + i] = (offsets.get("f_rest_" + (15 + i)) / 4)>>>0;
            this.ply_offsets[10 + 33 + i] = (offsets.get("f_rest_" + (30 + i)) / 4)>>>0;
        }
        this.ply_offsets[58] = (offsets.get("opacity") / 4)>>>0;
        this.ply_offsets[59] = (this.offset / 4)>>>0;
    }

    updatePlyoffsets_SpaceTime_LITE(offsets) {
        this.ply_offsets[0] = (offsets.get("x") / 4)>>>0;
        this.ply_offsets[1] = (offsets.get("y") / 4)>>>0;
        this.ply_offsets[2] = (offsets.get("z") / 4)>>>0;
        this.ply_offsets[3] = (offsets.get("scale_0") / 4)>>>0;
        this.ply_offsets[4] = (offsets.get("scale_1") / 4)>>>0;
        this.ply_offsets[5] = (offsets.get("scale_2") / 4)>>>0;
        this.ply_offsets[6] = (offsets.get("rot_1") / 4)>>>0;
        this.ply_offsets[7] = (offsets.get("rot_2") / 4)>>>0;
        this.ply_offsets[8] = (offsets.get("rot_3") / 4)>>>0;
        this.ply_offsets[9] = (offsets.get("rot_0") / 4)>>>0;
        this.ply_offsets[10] = (offsets.get("f_dc_0") / 4)>>>0;
        this.ply_offsets[11] = (offsets.get("f_dc_1") / 4)>>>0;
        this.ply_offsets[12] = (offsets.get("f_dc_2") / 4)>>>0;
        this.ply_offsets[13] = (offsets.get("opacity") / 4)>>>0;
        this.ply_offsets[14] = (offsets.get("trbf_center") / 4)>>>0;
        this.ply_offsets[15] = (offsets.get("trbf_scale") / 4)>>>0;
        for (let i=0;i<9;i+=1) {
            this.ply_offsets[16 + i] = (offsets.get("motion_" + (i)) / 4)>>>0;
        }
        for (let i=0;i<4;i+=1) {
            this.ply_offsets[25 + i] = (offsets.get("omega_" + (i)) / 4)>>>0;
        }
        this.ply_offsets[59] = (this.offset / 4)>>>0;
    }

    parseBinaryData(arrayBuffer, headerEnd) {
        const floatArray = new Float32Array(arrayBuffer.slice(headerEnd), 0, this.offset / 4 * this.pointCount);
        //console.log(floatArray);
        return floatArray;
    }

    async parsePTFile() {

    }

    dispatchSize(workgroup_size) {  // check correctness
        return PlyLoader.RoundUp(this.pointCount, workgroup_size);
    }
}

export { PlyLoader };