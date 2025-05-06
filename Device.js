class Device {
    static MAX_SPLAT_COUNT = 2**23;
    constructor() {
        this._device = null;
        this._adapter = null;

    }

    async initialize() {
        if (!navigator.gpu) {
            console.error("WebGPU not supported.");
            return false;
        }
        try {
            this._adapter = await navigator.gpu.requestAdapter({
                powerPreference: "high-performance" // optional：high-performance || low-power
            });

            if (!this._adapter.features.has("subgroups")) {
                throw new Error("Subgroups support is not available");
            }
            if (!this._adapter.features.has("shader-f16")) {
                throw new Error("shader-f16 support is not available");
            }

            if (this._adapter) {
                const adapterInfo = await this._adapter.info;
                console.log("Architecture:", adapterInfo.architecture,
                    "\nVendor:", adapterInfo.vendor);
            } else {
                console.error("Couldn't request WebGPU adapter.");
                return false;
            }

            console.log("Adapter Limits", 
                "\nmaxComputeWorkgroupSizeX", this._adapter.limits.maxComputeWorkgroupSizeX,
                "\nmaxComputeInvocationsPerWorkgroup", this._adapter.limits.maxComputeInvocationsPerWorkgroup,
                "\nmaxComputeWorkgroupStorageSize", this._adapter.limits.maxComputeWorkgroupStorageSize,
                "\nmaxBufferSize", this._adapter.limits.maxBufferSize,
                "\nmaxStorageBufferBindingSize", this._adapter.limits.maxStorageBufferBindingSize,
                "\nmaxStorageBuffersPerShaderStage", this._adapter.limits.maxStorageBuffersPerShaderStage,
                "\nsubgroupMinSize", this._adapter.info.subgroupMinSize,
                "\nsubgroupMaxSize", this._adapter.info.subgroupMaxSize,
            );

            const use_maxComputeWorkgroupSizeX = 512;
            const use_maxComputeInvocationsPerWorkgroup = 512;
            const use_maxComputeWorkgroupStorageSize = 20480;
            const use_maxBufferSize = Device.MAX_SPLAT_COUNT * 48 * 2;  // sh buffer
            const use_maxStorageBufferBindingSize = Device.MAX_SPLAT_COUNT * 48 * 2;  // sh buffer
            const use_maxStorageBuffersPerShaderStage = 10;
            if (use_maxComputeWorkgroupSizeX > this._adapter.limits.maxComputeWorkgroupSizeX ||
                use_maxComputeInvocationsPerWorkgroup > this._adapter.limits.maxComputeInvocationsPerWorkgroup ||
                use_maxComputeWorkgroupStorageSize > this._adapter.limits.maxComputeWorkgroupStorageSize ||
                use_maxBufferSize > this._adapter.limits.maxBufferSize ||
                use_maxStorageBufferBindingSize > this._adapter.limits.maxStorageBufferBindingSize ||
                use_maxStorageBuffersPerShaderStage > this._adapter.limits.maxStorageBuffersPerShaderStage
            ) {
                throw new Error("Require adapter limits:" + 
                    "\nmaxComputeWorkgroupSizeX: " + use_maxComputeWorkgroupSizeX + 
                    "\nmaxComputeInvocationsPerWorkgroup: " + use_maxComputeInvocationsPerWorkgroup + 
                    "\nmaxComputeWorkgroupStorageSize: " + use_maxComputeWorkgroupStorageSize +
                    "\nmaxBufferSize: " + use_maxBufferSize + 
                    "\nmaxStorageBufferBindingSize" + use_maxStorageBufferBindingSize +
                    "\nmaxStorageBuffersPerShaderStage" + use_maxStorageBuffersPerShaderStage
                );
            }

            this._device = await this._adapter.requestDevice({
                requiredFeatures:  ["subgroups", "shader-f16"],
                requiredLimits: {
                    maxComputeWorkgroupSizeX: use_maxComputeWorkgroupSizeX,
                    maxComputeInvocationsPerWorkgroup: use_maxComputeInvocationsPerWorkgroup,
                    maxComputeWorkgroupStorageSize: use_maxComputeWorkgroupStorageSize,
                    maxBufferSize: use_maxBufferSize,
                    maxStorageBufferBindingSize: use_maxStorageBufferBindingSize, 
                    maxStorageBuffersPerShaderStage: use_maxStorageBuffersPerShaderStage,
                }
            });

            console.log("Device Limits", 
                "\nmaxComputeWorkgroupSizeX", this._device.limits.maxComputeWorkgroupSizeX,
                "\nmaxComputeInvocationsPerWorkgroup", this._device.limits.maxComputeInvocationsPerWorkgroup,
                "\nmaxComputeWorkgroupStorageSize", this._device.limits.maxComputeWorkgroupStorageSize,
                "\nmaxComputeWorkgroupsPerDimension", this._device.limits.maxComputeWorkgroupsPerDimension,
                "\nmaxBufferSize", this._device.limits.maxBufferSize,
                "\nmaxStorageBufferBindingSize", this._device.limits.maxStorageBufferBindingSize,
                "\nmaxBindGroups", this._device.limits.maxBindGroups,
                "\nmaxBindingsPerBindGroup", this._device.limits.maxBindingsPerBindGroup,
                "\nmaxStorageBuffersPerShaderStage", this._device.limits.maxStorageBuffersPerShaderStage,
                "\nmaxDynamicUniformBuffersPerPipelineLayout", this._device.limits.maxDynamicUniformBuffersPerPipelineLayout,
                "\nminUniformBufferOffsetAlignment", this._device.limits.minUniformBufferOffsetAlignment,
                "\nminStorageBufferOffsetAlignment", this._device.limits.minStorageBufferOffsetAlignment,
            );

            console.log("[Device]: init successfully");
            return true;
        } catch (error) {
            console.error("Fail to create logical device", error);
            return false;
        }
    }

    createBufferAndFill(usage, data) {
        const buffer = this._device.createBuffer({
            size: data.byteLength,
            usage: usage,
            mappedAtCreation: true,
        });
    
        new Uint32Array(buffer.getMappedRange()).set(data);
        buffer.unmap();
        return buffer;
    }

    createBuffer(size, usage) {
        return this._device.createBuffer({ size: size, usage: usage });
    }

    get device() {
        return this._device;
    }

    get adapter() {
        return this._adapter;
    }
}

export {Device};