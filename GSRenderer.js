import parse_ply_comp_wgsl from './shaders/parse_ply_comp_wgsl.js';
import rank_comp_wgsl from './shaders/rank_comp_wgsl.js';
import inverse_index_comp_wgsl from './shaders/inverse_index_comp_wgsl.js';
import projection_comp_wgsl from './shaders/projection_comp_wgsl.js';
import splat_wgsl from './shaders/splat_wgsl.js';

class GSRenderer {
    static MAX_SPLAT_COUNT = 2**23;

    constructor(device_) {
        this.device = device_;

        this.set1 = {
            'pos': null,
            'cov3d': null,
            'opacity': null,
            'sh': null,
        };
        this.set2 = {
            'indirect': null,
            'instance': null,
            'visibleNum': null,
            'key': null,
            'index': null,
            'inverse': null,
        };

        this.bindGroup1 = null;
        this.bindGroup2 = null;
        this.bindGroupLayout1 = null;
        this.bindGroupLayout2 = null;

        this.presentationFormat = null;
        this.pipeline = {
            'parsePly': null,
            'rank': null,
            'projection': null,
            'inverse': null,
            'splat': null
        };
        this.pipelineLayout = {
            'parsePly': null,
            'rank': null,
            'projection': null,
            'inverse': null,
            'splat': null
        };

        this.preAllocate();
    }

    preAllocate() {
        {
            this.set1.pos = this.device.createBuffer(
                { size: GSRenderer.MAX_SPLAT_COUNT * 3 * 4, usage: GPUBufferUsage.STORAGE, label: "pos" }
            );
            this.set1.cov3d = this.device.createBuffer(
                { size: GSRenderer.MAX_SPLAT_COUNT * 6 * 4, usage: GPUBufferUsage.STORAGE, label: "cov3d" }
            );
            this.set1.opacity = this.device.createBuffer(
                { size: GSRenderer.MAX_SPLAT_COUNT * 1 * 4, usage: GPUBufferUsage.STORAGE, label: "opacity" }
            );
            this.set1.sh = this.device.createBuffer(
                { size: GSRenderer.MAX_SPLAT_COUNT * 48 * 2, usage: GPUBufferUsage.STORAGE, label: "sh" }
            );
        }
        {
            this.set2.indirect = this.device.createBuffer(
                { size: 5 * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.INDIRECT, label: "indirect" }
            );
            this.set2.instance = this.device.createBuffer(
                { size: GSRenderer.MAX_SPLAT_COUNT * 10 * 4, usage: GPUBufferUsage.STORAGE, label: "instance" }
            );
            this.set2.visibleNum = this.device.createBuffer(
                { size: 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST, label: "visibleNum" }
            );
            this.set2.key = this.device.createBuffer(
                { size: GSRenderer.MAX_SPLAT_COUNT * 1 * 4, usage: GPUBufferUsage.STORAGE, label: "key" }
            );
            this.set2.index = this.device.createBuffer(
                { size: GSRenderer.MAX_SPLAT_COUNT * 1 * 4, usage: GPUBufferUsage.STORAGE, label: "index" }
            );
            this.set2.inverse = this.device.createBuffer(
                { size: GSRenderer.MAX_SPLAT_COUNT * 1 * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, label: "inverse" }
            );
        }
    }

    createBindGroup() {
        this.bindGroupLayout_splat = this.device.createBindGroupLayout({
            entries: [
                {   // set1.instance read
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX,
                    buffer: { type: 'read-only-storage', },
                },
            ],
        });
        this.bindGroup_splat = this.device.createBindGroup({
            layout: this.bindGroupLayout_splat,
            entries: [
                {   // set1.instance read
                    binding: 0,
                    resource: {
                        buffer: this.set2.instance,
                    },
                },
            ],
        });
        this.bindGroupLayout1 = this.device.createBindGroupLayout({
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
                {   // set1.opacity
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
        this.bindGroup1 = this.device.createBindGroup({
            layout: this.bindGroupLayout1,
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
                {   // set1.opacity
                    binding: 2,
                    resource: {
                        buffer: this.set1.opacity,
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
        this.bindGroupLayout2 = this.device.createBindGroupLayout({
            entries: [
                {   // set2.indirect
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: 'storage', },
                },
                {   // set2.instance(write)
                    binding: 1,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: 'storage', },
                },
                {   // set2.visibleNum
                    binding: 2,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: 'storage', },
                },
                {   // set2.key
                    binding: 3,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: 'storage', },
                },
                {   // set2.index
                    binding: 4,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: 'storage', },
                },
                {   // set2.inverse
                    binding: 5,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: 'storage', },
                },
            ],
        });
        this.bindGroup2 = this.device.createBindGroup({
            layout: this.bindGroupLayout2,
            entries: [
                {   // set2.indirect
                    binding: 0,
                    resource: {
                        buffer: this.set2.indirect,
                    },
                },
                {   // set2.instance(write)
                    binding: 1,
                    resource: {
                        buffer: this.set2.instance,
                    },
                },
                {   // set2.visibleNum
                    binding: 2,
                    resource: {
                        buffer: this.set2.visibleNum,
                    },
                },
                {   // set2.key
                    binding: 3,
                    resource: {
                        buffer: this.set2.key,
                    },
                },
                {   // set2.index
                    binding: 4,
                    resource: {
                        buffer: this.set2.index,
                    },
                },
                {   // set2.inverse
                    binding: 5,
                    resource: {
                        buffer: this.set2.inverse,
                    },
                },
            ],
        });
    }
    createPipeline(bindGroupLayout0, bindGroupLayout3) {
        {   // parsePly
            this.pipelineLayout.parsePly = this.device.createPipelineLayout({
                bindGroupLayouts: [bindGroupLayout0, this.bindGroupLayout1, null, bindGroupLayout3],
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
                bindGroupLayouts: [bindGroupLayout0, this.bindGroupLayout1, this.bindGroupLayout2],
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
        {   // inverse
            this.pipelineLayout.inverse = this.device.createPipelineLayout({
                bindGroupLayouts: [bindGroupLayout0, null, this.bindGroupLayout2],
            });
            const shaderModule = this.device.createShaderModule({
                code: inverse_index_comp_wgsl,
            });
            this.pipeline.inverse = this.device.createComputePipeline({
                layout: this.pipelineLayout.inverse,
                compute: {
                    module: shaderModule,
                    entryPoint: "main",
                },
            });
        }
        {   // projection
            this.pipelineLayout.projection = this.pipelineLayout.rank;
            const shaderModule = this.device.createShaderModule({
                code: projection_comp_wgsl,
            });
            this.pipeline.projection = this.device.createComputePipeline({
                layout: this.pipelineLayout.projection,
                compute: {
                    module: shaderModule,
                    entryPoint: "main",
                },
            });
        }
        {   // splat
            this.pipelineLayout.splat = this.device.createPipelineLayout({
                bindGroupLayouts: [this.bindGroupLayout_splat],
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
        return this.set2.visibleNum;
    }

    get keyBuffer() {
        return this.set2.key;
    }

    get indexBuffer() {
        return this.set2.index;
    }

}

export {GSRenderer};