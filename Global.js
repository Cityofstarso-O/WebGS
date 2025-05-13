const GlobalVar = {
    MODE: "MODE_3DGS",
    MAX_SPLAT_COUNT: 2**23,
    DEBUG: true,
    DEBUG_BUFFER: null,
    CTX: null,
};

function recreateDebugBuffer(srcSize) {
    if (GlobalVar.DEBUG_BUFFER === null || GlobalVar.DEBUG_BUFFER.size < srcSize) {
        if (GlobalVar.DEBUG_BUFFER === null) {
            GlobalVar.DEBUG_BUFFER.destroy();
        }
        GlobalVar.DEBUG_BUFFER = GlobalVar.CTX.createBuffer({size: srcSize, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ});
    }
}

async function copy2hostf(srcBuffer, srcOffset, srcSize, desc=``) {
    recreateDebugBuffer(srcSize);
    GlobalVar.CTX.queue.copyBufferToBuffer(srcBuffer, srcOffset, GlobalVar.DEBUG_BUFFER, 0, srcSize);
    await GlobalVar.DEBUG_BUFFER.mapAsync(GPUMapMode.READ, 0, srcSize);
    console.log(desc, new Float32Array(GlobalVar.DEBUG_BUFFER.getMappedRange()));
    GlobalVar.DEBUG_BUFFER.unmap();
}

async function copy2hostu(srcBuffer, srcOffset, srcSize, desc=``) {
    recreateDebugBuffer(srcSize);
    GlobalVar.CTX.queue.copyBufferToBuffer(srcBuffer, srcOffset, GlobalVar.DEBUG_BUFFER, 0, srcSize);
    await GlobalVar.DEBUG_BUFFER.mapAsync(GPUMapMode.READ, 0, srcSize);
    console.log(desc, new Uint32Array(GlobalVar.DEBUG_BUFFER.getMappedRange()));
    GlobalVar.DEBUG_BUFFER.unmap();
}

async function copy2hosti(srcBuffer, srcOffset, srcSize, desc=``) {
    recreateDebugBuffer(srcSize);
    GlobalVar.CTX.queue.copyBufferToBuffer(srcBuffer, srcOffset, GlobalVar.DEBUG_BUFFER, 0, srcSize);
    await GlobalVar.DEBUG_BUFFER.mapAsync(GPUMapMode.READ, 0, srcSize);
    console.log(desc, new Int32Array(GlobalVar.DEBUG_BUFFER.getMappedRange()));
    GlobalVar.DEBUG_BUFFER.unmap();
}

export {GlobalVar};