import Device from './webgpu-radix-sort/Device.js';
import {RadixSorter, VrdxSorterStorageRequirements} from './webgpu-radix-sort/wgpu-radix-sort.js'

function generateAndShuffleArray(n) {
    let array = new Uint32Array(n);
    for (let i = 0; i < n; i++) {
        array[i] = i + 1;
    }

    for (let i = n - 1; i > 0; i--) {
        let j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }

    return array;
}

async function main() {
    const gpuDevice = new Device();

    if (await gpuDevice.initialize()) {
        
    } else {
        console.error("fail to init WebGPU");
    }

    const radixSorter = new RadixSorter(gpuDevice.adapter, gpuDevice.device);
    const num = 1000000;

    const reqs = radixSorter.vrdxGetSorterKeyValueStorageRequirements(num);
    const storageBuffer = gpuDevice.createBuffer(reqs.size, reqs.usage);

    const numBuffer = gpuDevice.createBufferAndFill(GPUBufferUsage.STORAGE, new Uint32Array([num]));

    const data = generateAndShuffleArray(num);
    // console.log(data);
    
    const stagingBuffer = gpuDevice.createBuffer(4 * num, GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ);

    const keysBuffer = gpuDevice.createBuffer(4 * num, GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC);
    const valsBuffer = gpuDevice.createBuffer(4 * num, GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC);
    gpuDevice.device.queue.writeBuffer(keysBuffer, 0, data);
    gpuDevice.device.queue.writeBuffer(valsBuffer, 0, data);

    radixSorter.createBindGroup(num, numBuffer, 0, keysBuffer, 0, valsBuffer, 0, storageBuffer, 0);
    radixSorter.createChecker(numBuffer, 0, keysBuffer, 0);

    const commandEncoder = gpuDevice.device.createCommandEncoder();
    radixSorter.gpuSort(commandEncoder, num, storageBuffer, 0);
    radixSorter.gpuCheck(commandEncoder, num);
    commandEncoder.copyBufferToBuffer(valsBuffer, 0, stagingBuffer, 0, 4 * num);
    const commandBuffer = commandEncoder.finish();
    gpuDevice.device.queue.submit([commandBuffer]);

    await stagingBuffer.mapAsync(GPUMapMode.READ);
    const mappedData = new Uint32Array(stagingBuffer.getMappedRange());
    // console.log("Staging Buffer Data:", mappedData);
    stagingBuffer.unmap();

    const result = await radixSorter.checkResult();
    console.log("check result:", result);

}

main();