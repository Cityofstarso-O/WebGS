import { GlobalVar, copy2host, map2hostf, map2hosti, map2hostu } from "./Global.js";
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
	const initialCameraPosition = vec3.create(0, 0, -2);
	const cameras = new Camera(initialCameraPosition, canvas, window.devicePixelRatio, gpuDevice.device);
	const radixSorter = new RadixSorter(gpuDevice.adapter, gpuDevice.device);

	const context = canvas.getContext('webgpu');
	const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
	context.configure({
		device: gpuDevice.device,
		format: presentationFormat,
	});
	gsRenderer.setFormat(presentationFormat);
	GlobalVar.CTX = gpuDevice.device;
	console.log("using format: " + presentationFormat);

	/**
	 * GUI
	 */
	const gui = new dat.GUI();
	// GUI parameters
	const guiContent = {
		fps: 0,
		camera: 'arcball',
		gaussian: 'SpaceTime_LITE',
		scaleModifier: 1.0,
		frustumDilation: 0.1,
		alphaCullingThreshold: 0.0,
		visibleNum: `0/0 0%`,
		timer: 0.0,
		pause: false,
	};
	// Callback handler for camera mode
	let oldCameraType = guiContent.camera;
	cameras.setType(guiContent.camera);
	gui.add(guiContent, 'fps').listen();
	gui.add(guiContent, 'visibleNum').listen();
	gui.add(guiContent, 'camera', ['arcball', 'WASD']).onChange(() => {
	  	const newCameraType = guiContent.camera;
	  	cameras.copyMatrix(oldCameraType, newCameraType);
	  	oldCameraType = newCameraType;
	  	cameras.setType(guiContent.camera);
	});
	gui.add(guiContent, 'gaussian', ['3DGS', 'SpaceTime_FULL', 'SpaceTime_LITE']).onChange(() => {

	});
	gui.add(guiContent, 'scaleModifier').min(0.1).max(1.5).step(0.01);
	gui.add(guiContent, 'frustumDilation').min(0.0).max(1.0).step(0.01);
	gui.add(guiContent, 'alphaCullingThreshold').min(0.0).max(1.0).step(0.01);
	gui.add(guiContent, 'timer').min(0.0).max(1.0).step(0.01).listen();
	gui.add(guiContent, 'pause');

	/**
	 * RESOURCE
	 */
	const reqs = radixSorter.vrdxGetSorterKeyValueStorageRequirements(GlobalVar.MAX_SPLAT_COUNT);
	const storageBuffer = gpuDevice.createBuffer(reqs.size, reqs.usage);
	gsRenderer.createBindGroup();
	cameras.createBindGroup();
	radixSorter.createBindGroup(GlobalVar.MAX_SPLAT_COUNT,
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
	async function frame() {
		const now = Date.now();
		const deltaTime = (now - lastFrameMS) / 1000;
		lastFrameMS = now;
		frameCount++;
		if (now - lastFPSMS > 1000) {
			guiContent.fps = Math.round(frameCount / ((now - lastFPSMS) * 0.001));
        	frameCount = 0;
        	lastFPSMS = now;
		}
		if (!guiContent.pause) {
			guiContent.timer += deltaTime;
		}
		if (guiContent.timer > 1.0) {
			guiContent.timer = 0.0;
		}

		cameras.updateCameraUniform( {
				scaleModifier: guiContent.scaleModifier,
				frustumDilation: guiContent.frustumDilation,
				alphaCullingThreshold: guiContent.alphaCullingThreshold,
				timer: guiContent.timer,
			}, deltaTime, inputHandler());

		const commandEncoder = gpuDevice.device.createCommandEncoder();
		if (plyLoader.newPlyReady) {
			plyLoader.gpuCopy(commandEncoder);
			const computePass = commandEncoder.beginComputePass({label: "ply"});
			computePass.setPipeline(gsRenderer.pipeline[GlobalVar.MODE].parsePly);
			computePass.setBindGroup(0, cameras.bindGroup);
			computePass.setBindGroup(1, gsRenderer.bindGroup[GlobalVar.MODE].set1);
			computePass.setBindGroup(3, plyLoader.bindGroup);
			computePass.dispatchWorkgroups(plyLoader.dispatchSize(workgroup_size), 1, 1);
			computePass.end();

			plyLoader.newPlyReady = false;
			cameras.updatePointCnt(plyLoader.pointCount);
		}
		cameras.writeCameraUniformBuffer();
		if (!plyLoader.newPlyReady && plyLoader.pointCount > 0) {
			{	// rank
				commandEncoder.clearBuffer(gsRenderer.set3.visibleNum, 0, 4);
				const computePass = commandEncoder.beginComputePass({label: "rank"});
				computePass.setPipeline(gsRenderer.pipeline[GlobalVar.MODE].rank);
				computePass.setBindGroup(0, cameras.bindGroup);
				computePass.setBindGroup(1, gsRenderer.bindGroup_read[GlobalVar.MODE].set1);
				computePass.setBindGroup(2, gsRenderer.bindGroup[GlobalVar.MODE].set2);
				computePass.setBindGroup(3, gsRenderer.bindGroup[GlobalVar.MODE].set3);
				computePass.dispatchWorkgroups(plyLoader.dispatchSize(workgroup_size), 1, 1);
				computePass.end();
				commandEncoder.copyBufferToBuffer(gsRenderer.set3.visibleNum, 0, gsRenderer.set_other.indirect, 4, 4);
				if (gsRenderer.set_other.staging.mapState === `unmapped`) {
					commandEncoder.copyBufferToBuffer(gsRenderer.set3.visibleNum, 0, gsRenderer.set_other.staging, 0, 4);
				}
			}
			{	// radix
				radixSorter.gpuSort(commandEncoder, plyLoader.pointCount, storageBuffer, 0);
			}
			if (!GlobalVar.DEBUG) {	// splat
				renderPassDescriptor.colorAttachments[0].view = context.getCurrentTexture().createView();

				const renderPass = commandEncoder.beginRenderPass(renderPassDescriptor);
				renderPass.setPipeline(gsRenderer.pipeline[GlobalVar.MODE].splat);
				renderPass.setBindGroup(0, cameras.bindGroup);
				renderPass.setBindGroup(1, gsRenderer.bindGroup_read[GlobalVar.MODE].set1);
				renderPass.setBindGroup(2, gsRenderer.bindGroup_read[GlobalVar.MODE].set2);
				renderPass.setIndexBuffer(indexBuffer, "uint32");
				renderPass.drawIndexedIndirect(gsRenderer.set_other.indirect, 0);
				renderPass.end();
			} else {	// debug
				const computePass = commandEncoder.beginComputePass({label: "debug"});
				computePass.setPipeline(gsRenderer.pipeline[GlobalVar.MODE].debug);
				computePass.setBindGroup(0, cameras.bindGroup);
				computePass.setBindGroup(1, gsRenderer.bindGroup[GlobalVar.MODE].set1);
				computePass.setBindGroup(2, gsRenderer.bindGroup[GlobalVar.MODE].set2);
				computePass.setBindGroup(3, gsRenderer.bindGroup_debug[GlobalVar.MODE].set3);
				computePass.dispatchWorkgroups(plyLoader.dispatchSize(workgroup_size), 1, 1);
				computePass.end();
				copy2host(commandEncoder, gsRenderer.set_other.debug, 0, 4);
			}
		}
		
		gpuDevice.device.queue.submit([commandEncoder.finish()]);

		if (gsRenderer.set_other.staging.mapState === `unmapped`) {
			gsRenderer.getVisibleNum(guiContent, plyLoader.pointCount);	// async
		}
		if (GlobalVar.DEBUG) {
			await map2hostf(4);
		}
		requestAnimationFrame(frame);
	}
	requestAnimationFrame(frame);
}

main();