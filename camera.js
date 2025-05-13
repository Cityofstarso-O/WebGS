import { mat4, vec3 } from 'https://wgpu-matrix.org/dist/3.x/wgpu-matrix.module.js';
import Input from './input.js';
import { GlobalVar } from "./Global.js";

// The common functionality between camera implementations
class CameraBase {
	static AlignUp(a, aligment) {
        return Math.floor((a + aligment - 1) / aligment) * aligment;
    }
	// The camera matrix
	constructor() {
		this.matrix_ = new Float32Array([
			1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
		]);

		this.view_ = mat4.create();

		this.right_ = new Float32Array(this.matrix_.buffer, 4 * 0, 3);
		this.up_ = new Float32Array(this.matrix_.buffer, 4 * 4, 3);
		this.back_ = new Float32Array(this.matrix_.buffer, 4 * 8, 3);
		this.position_ = new Float32Array(this.matrix_.buffer, 4 * 12, 3);
	}

	// Returns the camera matrix
	get matrix() {
		return this.matrix_;
	}

	// Assigns `mat` to the camera matrix
	set matrix(mat) {
		mat4.copy(mat, this.matrix_);
	}

	// Returns the camera view matrix
	get view() {
		return this.view_;
	}

	// Assigns `mat` to the camera view
	set view(mat) {
		mat4.copy(mat, this.view_);
	}

	// Returns column vector 0 of the camera matrix
	get right() {
		return this.right_;
	}

	// Assigns `vec` to the first 3 elements of column vector 0 of the camera matrix
	set right(vec) {
		vec3.copy(vec, this.right_);
	}

	// Returns column vector 1 of the camera matrix
	get up() {
		return this.up_;
	}

	// Assigns `vec` to the first 3 elements of column vector 1 of the camera matrix
	set up(vec) {
		vec3.copy(vec, this.up_);
	}

	// Returns column vector 2 of the camera matrix
	get back() {
		return this.back_;
	}

	// Assigns `vec` to the first 3 elements of column vector 2 of the camera matrix
	set back(vec) {
		vec3.copy(vec, this.back_);
	}

	// Returns column vector 3 of the camera matrix
	get position() {
		return this.position_;
	}

	// Assigns `vec` to the first 3 elements of column vector 3 of the camera matrix
	set position(vec) {
		vec3.copy(vec, this.position_);
	}
}

// WASDCamera is a camera implementation that behaves similar to first-person-shooter PC games.
export class WASDCamera extends CameraBase {
	// The camera absolute pitch angle
	pitch = 0;

	// The camera absolute yaw angle
	yaw = 0;

	// The movement velocity
	velocity_ = vec3.create();

	// Speed multiplier for camera movement
	movementSpeed = 10;

	// Speed multiplier for camera rotation
	rotationSpeed = 1;

	// Movement velocity drag coefficient [0 .. 1]
	// 0: Continues forever
	// 1: Instantly stops moving
	frictionCoefficient = 0.99;

	// Returns velocity vector
	get velocity() {
		return this.velocity_;
	}

	// Assigns `vec` to the velocity vector
	set velocity(vec) {
		vec3.copy(vec, this.velocity_);
	}

	constructor(options = {}) {
		super();
		const { position, target } = options;
		if (position || target) {
			const positionVec = position || vec3.create(0, 0, -5);
			const targetVec = target || vec3.create(0, 0, 0);
			const back = vec3.normalize(vec3.sub(positionVec, targetVec));
			this.recalculateAngles(back);
			this.position = positionVec;
		}
	}

	update(deltaTime, input) {
		const sign = (positive, negative) => (positive ? 1 : 0) - (negative ? 1 : 0);

		// Apply the delta rotation to the pitch and yaw angles
		this.yaw += input.analog.x * deltaTime * this.rotationSpeed;
		this.pitch += input.analog.y * deltaTime * this.rotationSpeed;

		// Wrap yaw between [0° .. 360°], just to prevent large accumulation.
		this.yaw = mod(this.yaw, Math.PI * 2);
		// Clamp pitch between [-90° .. +90°] to prevent somersaults.
		this.pitch = clamp(this.pitch, -Math.PI / 2, Math.PI / 2);

		// Save the current position, as we're about to rebuild the camera matrix.
		const position = vec3.copy(this.position);

		// Reconstruct the camera's rotation, and store into the camera matrix.
		this.matrix = mat4.rotateX(mat4.rotationY(this.yaw), this.pitch);

		// Calculate the new target velocity
		const digital = input.digital;
		const deltaRight = sign(digital.right, digital.left);
		const deltaUp = sign(digital.up, digital.down);
		const targetVelocity = vec3.create();
		const deltaBack = sign(digital.backward, digital.forward);
		vec3.addScaled(targetVelocity, this.right, deltaRight, targetVelocity);
		vec3.addScaled(targetVelocity, this.up, deltaUp, targetVelocity);
		vec3.addScaled(targetVelocity, this.back, deltaBack, targetVelocity);
		vec3.normalize(targetVelocity, targetVelocity);
		vec3.mulScalar(targetVelocity, this.movementSpeed, targetVelocity);

		// Mix new target velocity
		this.velocity = lerp(targetVelocity, this.velocity, Math.pow(1 - this.frictionCoefficient, deltaTime));

		// Integrate velocity to calculate new position
		this.position = vec3.addScaled(position, this.velocity, deltaTime);

		// Invert the camera matrix to build the view matrix
		this.view = mat4.invert(this.matrix);
		return this.view;
	}

	// Recalculates the yaw and pitch values from a directional vector
	recalculateAngles(dir) {
		this.yaw = Math.atan2(dir[0], dir[2]);
		this.pitch = -Math.asin(dir[1]);
	}
}

// ArcballCamera implements a basic orbiting camera around the world origin
export class ArcballCamera extends CameraBase {
	// The camera distance from the target
	distance = 0;

	// The current angular velocity
	angularVelocity = 0;

	// The current rotation axis
	axis_ = vec3.create();

	// Returns the rotation axis
	get axis() {
		return this.axis_;
	}

	// Assigns `vec` to the rotation axis
	set axis(vec) {
		vec3.copy(vec, this.axis_);
	}

	// Speed multiplier for camera rotation
	rotationSpeed = 1;

	// Speed multiplier for camera zoom
	zoomSpeed = 0.1;

	// Rotation velocity drag coefficient [0 .. 1]
	// 0: Spins forever
	// 1: Instantly stops spinning
	frictionCoefficient = 0.999;

	constructor(options = {}) {
		super();
		const { position } = options;
		if (position) {
			this.position = position;
			this.distance = vec3.len(this.position);
			this.back = vec3.normalize(this.position);
			this.recalcuateRight();
			this.recalcuateUp();
		}
	}

	update(deltaTime, input) {
		const epsilon = 0.0000001;

		if (input.analog.touching) {
			// Currently being dragged.
			this.angularVelocity = 0;
		} else {
			// Dampen any existing angular velocity
			this.angularVelocity *= Math.pow(1 - this.frictionCoefficient, deltaTime);
		}

		// Calculate the movement vector
		const movement = vec3.create();
		vec3.addScaled(movement, this.right, -input.analog.x, movement);
		vec3.addScaled(movement, this.up, input.analog.y, movement);

		// Cross the movement vector with the view direction to calculate the rotation axis x magnitude
		const crossProduct = vec3.cross(movement, this.back);

		// Calculate the magnitude of the drag
		const magnitude = vec3.len(crossProduct);

		if (magnitude > epsilon) {
			// Normalize the crossProduct to get the rotation axis
			this.axis = vec3.scale(crossProduct, 1 / magnitude);

			// Remember the current angular velocity. This is used when the touch is released for a fling.
			this.angularVelocity = magnitude * this.rotationSpeed;
		}

		// The rotation around this.axis to apply to the camera matrix this update
		const rotationAngle = this.angularVelocity * deltaTime;
		if (rotationAngle > epsilon) {
			// Rotate the matrix around axis
			// Note: The rotation is not done as a matrix-matrix multiply as the repeated multiplications
			// will quickly introduce substantial error into the matrix.
			this.back = vec3.normalize(rotate(this.back, this.axis, rotationAngle));
			this.recalcuateRight();
			this.recalcuateUp();
		}

		// recalculate `this.position` from `this.back` considering zoom
		if (input.analog.zoom !== 0) {
			this.distance *= 1 + input.analog.zoom * this.zoomSpeed;
		}
		this.position = vec3.scale(this.back, this.distance);

		// Invert the camera matrix to build the view matrix
		this.view = mat4.invert(this.matrix);
		return this.view;
	}

	// Assigns `this.right` with the cross product of `this.up` and `this.back`
	recalcuateRight() {
		this.right = vec3.normalize(vec3.cross(this.up, this.back));
	}

	// Assigns `this.up` with the cross product of `this.back` and `this.right`
	recalcuateUp() {
		this.up = vec3.normalize(vec3.cross(this.back, this.right));
	}
}

export class Camera extends CameraBase {
	constructor(initialCameraPosition, canvas, devicePixelRatio, device) {
		super();
		this.cameras = {
			arcball: new ArcballCamera({ position: initialCameraPosition }),
			WASD: new WASDCamera({ position: initialCameraPosition }),
		};

		this.type = null;
		this.device = device;
		this.canvas = canvas;
		this.aspect = 0;
		this.devicePixelRatio = devicePixelRatio;
		this.updateCanvas();
		this.createCameraUniformBuffer();
	}

	createCameraUniformBuffer() {
		const bufferSize = Camera.AlignUp(184, 16);
		const buffer = new ArrayBuffer(bufferSize);
		const dataView = new DataView(buffer);
	  
		this.uniformHost =  {
		  	buffer: buffer,
		  	view: dataView,
			mem: {
				proj: { offset: 0, size: 64},
				view: { offset: 64, size: 64},
				camPos: { offset: 128, size: 12},
				pointCnt: { offset: 140, size: 4},
				focal: { offset: 144, size: 8},
				viewport: { offset: 152, size: 8},
				invClientViewport: { offset: 160, size: 8},
				scaleModifier: { offset: 168, size: 4},
				frustumDilation: { offset: 172, size: 4},
				alphaCullingThreshold: { offset: 176, size: 4},
				timer: { offset: 180, size: 4 },
			}
		};

		const DEBUG_FLAG = GlobalVar ? GPUBufferUsage.COPY_SRC : 0;
		this.cameraUniformBuffer = this.device.createBuffer({
			size: bufferSize,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST | DEBUG_FLAG,
		});
	}

	createBindGroup() {
		this.bindGroupLayout0 = this.device.createBindGroupLayout({
            entries: [
                {   // set0.camera
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE | GPUShaderStage.VERTEX,
                    buffer: { type: 'uniform', },
                },
            ],
        });
		this.bindGroup0 = this.device.createBindGroup({
            layout: this.bindGroupLayout0,
            entries: [
                {   // set0.camera
                    binding: 0,
                    resource: {
                        buffer: this.cameraUniformBuffer,
                    },
                },
            ],
        });
	}

	updateCameraUniform(param, deltaTime, input) {
		const aspect = this.canvas.clientWidth / this.canvas.clientHeight;
		const width = this.canvas.clientWidth * this.devicePixelRatio;
		const height = this.canvas.clientHeight * this.devicePixelRatio;
		if (aspect !== this.aspect) {
			this.updateCanvas();
			this.aspect = aspect;
			this.projectionMatrix = mat4.perspective((2 * Math.PI) / 6, this.aspect, 0.1, 2000.0);
			this.projectionMatrix[5] *= -1;
			this.projectionMatrix[0] *= -1;
			for (let i = 0; i < 16; ++i) {
			  	this.uniformHost.view.setFloat32(this.uniformHost.mem.proj.offset + i * 4, this.projectionMatrix[i], true);
			}
		}
		const focalX =this.projectionMatrix[0] * 0.5 * width;
		const focalY =this.projectionMatrix[5] * 0.5 * height;
	  	const viewMatrix = this.update(deltaTime, input);
		for (let i = 0; i < 16; ++i) {
		  	this.uniformHost.view.setFloat32(this.uniformHost.mem.view.offset + i * 4, viewMatrix[i], true);
		}
	  
		this.uniformHost.view.setFloat32(this.uniformHost.mem.camPos.offset, this.position[0], true);
		this.uniformHost.view.setFloat32(this.uniformHost.mem.camPos.offset + 4, this.position[1], true);
		this.uniformHost.view.setFloat32(this.uniformHost.mem.camPos.offset + 8, this.position[2], true);
		this.uniformHost.view.setFloat32(this.uniformHost.mem.focal.offset, focalX, true);
		this.uniformHost.view.setFloat32(this.uniformHost.mem.focal.offset + 4, focalY, true);
		this.uniformHost.view.setFloat32(this.uniformHost.mem.viewport.offset, width, true);
		this.uniformHost.view.setFloat32(this.uniformHost.mem.viewport.offset + 4, height, true);
		this.uniformHost.view.setFloat32(this.uniformHost.mem.invClientViewport.offset, 1.0 / width, true);
		this.uniformHost.view.setFloat32(this.uniformHost.mem.invClientViewport.offset + 4, 1.0 / height, true);
		this.uniformHost.view.setFloat32(this.uniformHost.mem.scaleModifier.offset, param.scaleModifier, true);
		this.uniformHost.view.setFloat32(this.uniformHost.mem.frustumDilation.offset, param.frustumDilation, true);
		this.uniformHost.view.setFloat32(this.uniformHost.mem.alphaCullingThreshold.offset, param.alphaCullingThreshold, true);
		this.uniformHost.view.setFloat32(this.uniformHost.mem.timer.offset, param.timer, true);
	}

	updatePointCnt(pointCnt) {
		this.uniformHost.view.setUint32(this.uniformHost.mem.pointCnt.offset, pointCnt, true);
	}

	copyMatrix(srcType, dstType) {
		this.cameras[dstType].matrix = this.cameras[srcType].matrix;
	}

	setType(cameraType) {
		this.type = cameraType;
	}

	update(deltaTime, input) {
		return this.cameras[this.type].update(deltaTime, input);
	}

	updateCanvas() {
		this.canvas.width  = this.canvas.clientWidth *  this.devicePixelRatio;
		this.canvas.height = this.canvas.clientHeight * this.devicePixelRatio;
	}

	get position() {
		return this.cameras[this.type].position;
	}

	get bindGroup() {
		return this.bindGroup0;
	}

	get bindGroupLayout() {
		return this.bindGroupLayout0;
	}

	writeCameraUniformBuffer() {
		this.device.queue.writeBuffer(this.cameraUniformBuffer, 0, this.uniformHost.buffer);
	}
}

// Returns `x` clamped between [`min` .. `max`]
function clamp(x, min, max) {
	return Math.min(Math.max(x, min), max);
}

// Returns `x` float-modulo `div`
function mod(x, div) {
	return x - Math.floor(Math.abs(x) / div) * div * Math.sign(x);
}

// Returns `vec` rotated `angle` radians around `axis`
function rotate(vec, axis, angle) {
	return vec3.transformMat4Upper3x3(vec, mat4.rotation(axis, angle));
}

// Returns the linear interpolation between 'a' and 'b' using 's'
function lerp(a, b, s) {
	return vec3.addScaled(a, vec3.sub(b, a), s);
}