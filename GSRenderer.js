import parse_ply_comp_wgsl from './shaders/parse_ply_comp_wgsl.js';
import rank_comp_wgsl from './shaders/rank_comp_wgsl.js';
import splat_wgsl from './shaders/splat_wgsl.js';
import { GlobalVar } from "./Global.js";

class GSRenderer {
    constructor(device_) {
        this.device = device_;

        this.set1 = {
            'pos': null,
            'cov3d': null,
            'color': null,
            'sh': null,
        };
        this.set2 = {
            'key': null,
            'index': null,
        };
        this.set3 = {
            'visibleNum': null
        };
        this.set_other = {
            'indirect': null
        };

        this.bindGroup = {
            'set1': null,
            'set2': null,
            'set3': null,
        }
        this.bindGroupLayout = {
            'set1': null,
            'set2': null,
            'set3': null,
        }
        this.bindGroup_read = {
            'set2': null,
            'set3': null,
        }
        this.bindGroupLayout_read = {
            'set2': null,
            'set3': null,
        }

        this.presentationFormat = null;
        this.pipeline = {
            'parsePly': null,
            'rank': null,
            'splat': null
        };
        this.pipelineLayout = {
            'parsePly': null,
            'rank': null,
            'splat': null
        };

        this.preAllocate();
    }

    preAllocate() {
        const DEBUG_FLAG = GlobalVar ? GPUBufferUsage.COPY_SRC : 0;
        const maxCount = GlobalVar.MAX_SPLAT_COUNT;
        {
            this.set1.pos = this.device.createBuffer(
                { size: maxCount * 3 * 4, usage: GPUBufferUsage.STORAGE | DEBUG_FLAG, label: "pos" }
            );
            this.set1.cov3d = this.device.createBuffer(
                { size: maxCount * 6 * 4, usage: GPUBufferUsage.STORAGE | DEBUG_FLAG, label: "cov3d" }
            );
            this.set1.color = this.device.createBuffer(
                { size: maxCount * 4 * 4, usage: GPUBufferUsage.STORAGE | DEBUG_FLAG, label: "color" }
            );
            this.set1.sh = this.device.createBuffer(
                { size: maxCount * 48 * 2, usage: GPUBufferUsage.STORAGE | DEBUG_FLAG, label: "sh" }
            );
        }
        {
            this.set2.key = this.device.createBuffer(
                { size: maxCount * 1 * 4, usage: GPUBufferUsage.STORAGE | DEBUG_FLAG, label: "key" }
            );
            this.set2.index = this.device.createBuffer(
                { size: maxCount * 1 * 4, usage: GPUBufferUsage.STORAGE | DEBUG_FLAG, label: "index" }
            );
        }
        {
            this.set3.visibleNum = this.device.createBuffer(
                { size: 1 * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST, label: "visibleNum" }
            );
        }
        {
            this.set_other.indirect = this.device.createBuffer(
                { size: 5 * 4, usage: GPUBufferUsage.INDIRECT | GPUBufferUsage.COPY_DST | DEBUG_FLAG, label: "indirect", mappedAtCreation: true, }
            );
            new Uint32Array(this.set_other.indirect.getMappedRange()).set(new Uint32Array([6, 0, 0, 0, 0]));
            this.set_other.indirect.unmap();
        }
    }

    createBindGroup() {
        this.bindGroupLayout.set1 = this.device.createBindGroupLayout({
            entries: [
                {   // set1.pos
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: 'storage', },
                },
                {   // set1.cov3d
                    binding: 1,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: 'storage', },
                },
                {   // set1.color
                    binding: 2,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: 'storage', },
                },
                {   // set1.sh
                    binding: 3,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: 'storage', },
                },
            ],
        });
        this.bindGroup.set1 = this.device.createBindGroup({
            layout: this.bindGroupLayout.set1,
            entries: [
                {   // set1.pos
                    binding: 0,
                    resource: {
                        buffer: this.set1.pos,
                    },
                },
                {   // set1.cov3d
                    binding: 1,
                    resource: {
                        buffer: this.set1.cov3d,
                    },
                },
                {   // set1.color
                    binding: 2,
                    resource: {
                        buffer: this.set1.color,
                    },
                },
                {   // set1.sh
                    binding: 3,
                    resource: {
                        buffer: this.set1.sh,
                    },
                },
            ],
        });

        this.bindGroupLayout.set2 = this.device.createBindGroupLayout({
            entries: [
                {   // set2.key
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: 'storage', },
                },
                {   // set2.index
                    binding: 1,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: 'storage', },
                },
            ],
        });
        this.bindGroup.set2 = this.device.createBindGroup({
            layout: this.bindGroupLayout.set2,
            entries: [
                {   // set2.key
                    binding: 0,
                    resource: {
                        buffer: this.set2.key,
                    },
                },
                {   // set2.index
                    binding: 1,
                    resource: {
                        buffer: this.set2.index,
                    },
                },
            ],
        });

        this.bindGroupLayout.set3 = this.device.createBindGroupLayout({
            entries: [
                {   // set3.indirect
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: 'storage', },
                },
            ],
        });
        this.bindGroup.set3 = this.device.createBindGroup({
            layout: this.bindGroupLayout.set3,
            entries: [
                {   // set3.indirect
                    binding: 0,
                    resource: {
                        buffer: this.set3.visibleNum,
                    },
                },
            ],
        });

        this.bindGroupLayout_read.set1 = this.device.createBindGroupLayout({
            entries: [
                {   // set1.pos
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE | GPUShaderStage.VERTEX,
                    buffer: { type: 'read-only-storage', },
                },
                {   // set1.cov3d
                    binding: 1,
                    visibility: GPUShaderStage.COMPUTE | GPUShaderStage.VERTEX,
                    buffer: { type: 'read-only-storage', },
                },
                {   // set1.color
                    binding: 2,
                    visibility: GPUShaderStage.COMPUTE | GPUShaderStage.VERTEX,
                    buffer: { type: 'read-only-storage', },
                },
                {   // set1.sh
                    binding: 3,
                    visibility: GPUShaderStage.COMPUTE | GPUShaderStage.VERTEX,
                    buffer: { type: 'read-only-storage', },
                },
            ],
        });
        this.bindGroup_read.set1 = this.device.createBindGroup({
            layout: this.bindGroupLayout_read.set1,
            entries: [
                {   // set1.pos
                    binding: 0,
                    resource: {
                        buffer: this.set1.pos,
                    },
                },
                {   // set1.cov3d
                    binding: 1,
                    resource: {
                        buffer: this.set1.cov3d,
                    },
                },
                {   // set1.color
                    binding: 2,
                    resource: {
                        buffer: this.set1.color,
                    },
                },
                {   // set1.sh
                    binding: 3,
                    resource: {
                        buffer: this.set1.sh,
                    },
                },
            ],
        });

        this.bindGroupLayout_read.set2 = this.device.createBindGroupLayout({
            entries: [
                {   // set2.key
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX,
                    buffer: { type: 'read-only-storage', },
                },
                {   // set2.index
                    binding: 1,
                    visibility: GPUShaderStage.VERTEX,
                    buffer: { type: 'read-only-storage', },
                },
            ],
        });
        this.bindGroup_read.set2 = this.device.createBindGroup({
            layout: this.bindGroupLayout_read.set2,
            entries: [
                {   // set2.key
                    binding: 0,
                    resource: {
                        buffer: this.set2.key,
                    },
                },
                {   // set2.index
                    binding: 1,
                    resource: {
                        buffer: this.set2.index,
                    },
                },
            ],
        });
    }

    createPipeline(bindGroupLayout0, bindGroupLayout3) {
        {   // parsePly
            this.pipelineLayout.parsePly = this.device.createPipelineLayout({
                bindGroupLayouts: [bindGroupLayout0, this.bindGroupLayout.set1, null, bindGroupLayout3],
            });
            const shaderModule = this.device.createShaderModule({
                code: parse_ply_comp_wgsl,
            });
            this.pipeline.parsePly = this.device.createComputePipeline({
                layout: this.pipelineLayout.parsePly,
                compute: {
                    module: shaderModule,
                    entryPoint: "main",
                },
            });
        }
        {   // rank
            this.pipelineLayout.rank = this.device.createPipelineLayout({
                bindGroupLayouts: [bindGroupLayout0, this.bindGroupLayout_read.set1, this.bindGroupLayout.set2, this.bindGroupLayout.set3],
            });
            const shaderModule = this.device.createShaderModule({
                code: rank_comp_wgsl,
            });
            this.pipeline.rank = this.device.createComputePipeline({
                layout: this.pipelineLayout.rank,
                compute: {
                    module: shaderModule,
                    entryPoint: "main",
                },
            });
        }
        {   // splat
            this.pipelineLayout.splat = this.device.createPipelineLayout({
                bindGroupLayouts: [bindGroupLayout0, this.bindGroupLayout_read.set1, this.bindGroupLayout_read.set2,],
            });
            this.pipeline.splat = this.device.createRenderPipeline({
                layout: this.pipelineLayout.splat,
                fragment: {
                    entryPoint: "frag_main",
                    module: this.device.createShaderModule({
                        code: splat_wgsl,
                    }),
                    targets: [
                        {
                            blend: {
                                alpha: {
                                    srcFactor: "one",
                                    dstFactor: "one-minus-src-alpha",
                                    operator: "add",
                                },
                                color: {
                                    srcFactor: "one",
                                    dstFactor: "one-minus-src-alpha",
                                    operator: "add",
                                },
                            },
                            format: this.presentationFormat,
                        },
                    ],
                },
                primitive: {
                    topology: "triangle-list",
                    frontFace: "ccw",
                    cullMode: "none",
                },
                vertex: {
                    entryPoint: "vert_main",
                    module: this.device.createShaderModule({
                        code: splat_wgsl,
                    }),
                }
            });
        }
    }

    setFormat(format) {
        this.presentationFormat = format;
    }

    get visibleNumBuffer() {
        return this.set3.visibleNum;
    }

    get keyBuffer() {
        return this.set2.key;
    }

    get indexBuffer() {
        return this.set2.index;
    }

}

export {GSRenderer};