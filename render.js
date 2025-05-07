import { mat4, vec3 } from 'https://wgpu-matrix.org/dist/3.x/wgpu-matrix.module.js';
import { ArcballCamera, WASDCamera, Camera } from './camera.js';
import { createInputHandler } from './input.js';
import { Device } from './Device.js'
import { PlyLoader } from './PlyLoader.js';
import { GSRenderer } from './GSRenderer.js';
import { RadixSorter, VrdxSorterStorageRequirements } from './webgpu-radix-sort/wgpu-radix-sort.js';

async function main() {
	/**
	 * CONTEXT
	 */
	const canvas = document.querySelector('canvas');
	const gpuDevice = new Device();
	await gpuDevice.initialize();
	const plyLoader = new PlyLoader(gpuDevice.device);
	const inputHandler = createInputHandler(window, canvas, plyLoader);
	const gsRenderer = new GSRenderer(gpuDevice.device);
	const initialCameraPosition = vec3.create(3, 2, 5);
	const cameras = new Camera(initialCameraPosition, canvas, window.devicePixelRatio, gpuDevice.device);
	const radixSorter = new RadixSorter(gpuDevice.adapter, gpuDevice.device);

	const context = canvas.getContext('webgpu');
	const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
	context.configure({
		device: gpuDevice.device,
		format: presentationFormat,
	});
	gsRenderer.setFormat(presentationFormat);
	console.log("using format: " + presentationFormat);

	/**
	 * GUI
	 */
	const gui = new dat.GUI();
	// GUI parameters
	const params = {
		type: 'arcball',
	};
	const fpsInfo = {
		fps: 0,
	  };
	// Callback handler for camera mode
	let oldCameraType = params.type;
	cameras.setType(params.type);
	gui.add(fpsInfo, 'fps').listen();
	gui.add(params, 'type', ['arcball', 'WASD']).onChange(() => {
	  const newCameraType = params.type;
	  cameras.copyMatrix(oldCameraType, newCameraType);
	  oldCameraType = newCameraType;
	  cameras.setType(params.type);
	});

	/**
	 * RESOURCE
	 */
	const reqs = radixSorter.vrdxGetSorterKeyValueStorageRequirements(GSRenderer.MAX_SPLAT_COUNT);
	const storageBuffer = gpuDevice.createBuffer(reqs.size, reqs.usage);
	gsRenderer.createBindGroup();
	cameras.createBindGroup();
	radixSorter.createBindGroup(GSRenderer.MAX_SPLAT_COUNT,
		gsRenderer.visibleNumBuffer, 0,
		gsRenderer.keyBuffer, 0,
		gsRenderer.indexBuffer, 0,
		storageBuffer, 0
	);
	gsRenderer.createPipeline(cameras.bindGroupLayout, plyLoader.bindGroupLayout);

	const renderPassDescriptor = {
		label: "splat",
		colorAttachments: [
			{
				view: undefined, // Assigned later
				clearValue: [0.0, 0.0, 0.0, 1.0],
				loadOp: 'clear',
				storeOp: 'store',
			},
		],
	};
	const indexBuffer = gpuDevice.createBufferAndFill(
		GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
		new Uint32Array([0, 1, 2, 2, 1, 3])
	);

	/**
	 * RENDER
	 */
	const workgroup_size = 512;
    let frameCount = 0;
	let lastFPSMS = Date.now();
	let lastFrameMS = lastFPSMS;
	function frame() {
		const now = Date.now();
		const deltaTime = (now - lastFrameMS) / 1000;
		lastFrameMS = now;
		frameCount++;
		if (now - lastFPSMS > 1000) {
			fpsInfo.fps = Math.round(frameCount / ((now - lastFPSMS) * 0.001));
        	frameCount = 0;
        	lastFPSMS = now;
		}

		cameras.updateCameraUniform(deltaTime, inputHandler());
		cameras.writeCameraUniformBuffer();

		const commandEncoder = gpuDevice.device.createCommandEncoder();
		if (plyLoader.newPlyReady) {
			plyLoader.gpuCopy(commandEncoder);
			const computePass = commandEncoder.beginComputePass({label: "ply"});
			computePass.setPipeline(gsRenderer.pipeline.parsePly);
			computePass.setBindGroup(0, cameras.bindGroup);
			computePass.setBindGroup(1, gsRenderer.bindGroup1);
			computePass.setBindGroup(3, plyLoader.bindGroup);
			computePass.dispatchWorkgroups(plyLoader.dispatchSize(workgroup_size), 1, 1);
			computePass.end();

			plyLoader.newPlyReady = false;
			cameras.writeNumUniformBuffer(plyLoader.pointCount);
		}
		if (!plyLoader.newPlyReady && plyLoader.pointCount > 0) {
			{	// rank
				commandEncoder.clearBuffer(gsRenderer.set2.visibleNum, 0, 4);
				const computePass = commandEncoder.beginComputePass({label: "rank"});
				computePass.setPipeline(gsRenderer.pipeline.rank);
				computePass.setBindGroup(0, cameras.bindGroup);
				computePass.setBindGroup(1, gsRenderer.bindGroup1);
				computePass.setBindGroup(2, gsRenderer.bindGroup2);
				computePass.dispatchWorkgroups(plyLoader.dispatchSize(workgroup_size), 1, 1);
				computePass.end();
			}
			{	// radix
				radixSorter.gpuSort(commandEncoder, plyLoader.pointCount, storageBuffer, 0);
			}
			{	
				commandEncoder.clearBuffer(gsRenderer.set2.inverse, 0, plyLoader.pointCount * 4);
				const computePass = commandEncoder.beginComputePass({label: "inverse | projection"});
				{	// inverse
					computePass.setBindGroup(0, cameras.bindGroup);
					computePass.setBindGroup(2, gsRenderer.bindGroup2);
					computePass.setPipeline(gsRenderer.pipeline.inverse);
					computePass.dispatchWorkgroups(plyLoader.dispatchSize(workgroup_size), 1, 1);
				}
				{	// projection
					computePass.setBindGroup(1, gsRenderer.bindGroup1);
					computePass.setPipeline(gsRenderer.pipeline.projection);
					computePass.dispatchWorkgroups(plyLoader.dispatchSize(workgroup_size), 1, 1);
				}
				computePass.end();
			}
			{	// splat
				renderPassDescriptor.colorAttachments[0].view = context.getCurrentTexture().createView();

				const renderPass = commandEncoder.beginRenderPass(renderPassDescriptor);
				renderPass.setBindGroup(0, gsRenderer.bindGroup_splat);
				renderPass.setPipeline(gsRenderer.pipeline.splat);
				renderPass.setIndexBuffer(indexBuffer, "uint32");
				renderPass.drawIndexedIndirect(gsRenderer.set2.indirect, 0);
				renderPass.end();
			}
		}
		
		gpuDevice.device.queue.submit([commandEncoder.finish()]);

		requestAnimationFrame(frame);
	}
	requestAnimationFrame(frame);
}

main();