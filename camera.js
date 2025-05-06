import { mat4, vec3 } from 'https://wgpu-matrix.org/dist/3.x/wgpu-matrix.module.js';
import Input from './input.js';

// The common functionality between camera implementations
class CameraBase {
	// The camera matrix
	constructor() {
		this.matrix_ = new Float32Array([
			1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
		]);

		this.view_ = mat4.create();

		this.right_ = new Float32Array(this.matrix_.buffer, 4 * 0, 4);
		this.up_ = new Float32Array(this.matrix_.buffer, 4 * 4, 4);
		this.back_ = new Float32Array(this.matrix_.buffer, 4 * 8, 4);
		this.position_ = new Float32Array(this.matrix_.buffer, 4 * 12, 4);
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
		this.yaw -= input.analog.x * deltaTime * this.rotationSpeed;
		this.pitch -= input.analog.y * deltaTime * this.rotationSpeed;

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
		vec3.addScaled(movement, this.right, input.analog.x, movement);
		vec3.addScaled(movement, this.up, -input.analog.y, movement);

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
		this.canvas = canvas;
		this.aspect = this.canvas.clientWidth / this.canvas.clientHeight;
		this.projectionMatrix = mat4.perspective((2 * Math.PI) / 5, this.aspect, 1, 100.0);
		this.devicePixelRatio = devicePixelRatio;
		this.device = device;
		this.updateCanvas();
		this.createCameraUniformBuffer();
	}

	createCameraUniformBuffer() {
		const projectionMatrixSize = 4 * 4 * 4;
		const viewMatrixSize = 4 * 4 * 4;
		const cameraPositionSize = 3 * 4;
		const pad0Size = 4;
		const screenSizeSize = 2 * 4 + 8;	// 8 is padding
	  
		const bufferSize = projectionMatrixSize + viewMatrixSize + cameraPositionSize + pad0Size + screenSizeSize;
	  
		const buffer = new ArrayBuffer(bufferSize);
		const dataView = new DataView(buffer);

		let offset = 0;
		const projectionOffset = offset;
		offset += projectionMatrixSize;
		const viewOffset = offset;
		offset += viewMatrixSize;
		const cameraPositionOffset = offset;
		offset += cameraPositionSize;
		const pad0Offset = offset;
		offset += pad0Size;
		const screenSizeOffset = offset;
	  
		this.cameraUniformHost =  {
		  	buffer,
		  	projectionOffset,
		  	viewOffset,
		  	cameraPositionOffset,
		  	pad0Offset,
		  	screenSizeOffset,
		  	dataView,
		};

		this.cameraUniformBuffer = this.device.createBuffer({
			size: bufferSize,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
		});
		this.numUniformBuffer = this.device.createBuffer({
			size: 4,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
		});
	}

	createBindGroup() {
		this.bindGroupLayout0 = this.device.createBindGroupLayout({
            entries: [
                {   // set0.camera
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: 'uniform', },
                },
				{   // set0.num
                    binding: 1,
                    visibility: GPUShaderStage.COMPUTE,
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
				{   // set0.num
                    binding: 1,
                    resource: {
                        buffer: this.numUniformBuffer,
                    },
                },
            ],
        });
	}

	updateCameraUniform(deltaTime, input) {
		const aspect = this.canvas.clientWidth / this.canvas.clientHeight;
		if (aspect !== this.aspect) {
			//this.updateCanvas();
			this.aspect = aspect;
			this.projectionMatrix = mat4.perspective((2 * Math.PI) / 5, this.aspect, 1, 100.0);
		}
	  	const viewMatrix = this.update(deltaTime, input);

		for (let i = 0; i < 16; ++i) {
		  	this.cameraUniformHost.dataView.setFloat32(this.cameraUniformHost.projectionOffset + i * 4, this.projectionMatrix[i], true);
		  	this.cameraUniformHost.dataView.setFloat32(this.cameraUniformHost.viewOffset + i * 4, viewMatrix[i], true);
		}
	  
		this.cameraUniformHost.dataView.setFloat32(this.cameraUniformHost.cameraPositionOffset +  0, this.position[0], true);
		this.cameraUniformHost.dataView.setFloat32(this.cameraUniformHost.cameraPositionOffset +  4, this.position[1], true);
		this.cameraUniformHost.dataView.setFloat32(this.cameraUniformHost.cameraPositionOffset +  8, this.position[2], true);
		this.cameraUniformHost.dataView.setFloat32(this.cameraUniformHost.cameraPositionOffset + 12, this.position[3], true);
	  
		this.cameraUniformHost.dataView.setUint32(this.cameraUniformHost.screenSizeOffset, this.canvas.width, true);
		this.cameraUniformHost.dataView.setUint32(this.cameraUniformHost.screenSizeOffset + 4, this.canvas.height, true);
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

	// do not update Canvas in render loop, just update projMat is fine
	// use this only once when init Camera
	updateCanvas() {
		this.canvas.width  = this.canvas.clientWidth *  this.devicePixelRatio;
		this.canvas.height = this.canvas.clientHeight * this.devicePixelRatio;
	}

	getMVPMat_test(deltaTime, input) {
		const aspect = this.canvas.clientWidth / this.canvas.clientHeight;
		if (aspect !== this.aspect) {
			//this.updateCanvas();
			this.aspect = aspect;
			this.projectionMatrix = mat4.perspective((2 * Math.PI) / 5, this.aspect, 1, 100.0);
		}
	  	const viewMatrix = this.update(deltaTime, input);
		const modelViewProjectionMatrix = mat4.create();
	  	mat4.multiply(this.projectionMatrix, viewMatrix, modelViewProjectionMatrix);
	  	return modelViewProjectionMatrix;
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
		this.device.queue.writeBuffer(this.cameraUniformBuffer, 0, this.cameraUniformHost.buffer);
	}
	writeNumUniformBuffer(num) {
		const numData = new Uint32Array([num]);
		this.device.queue.writeBuffer(this.numUniformBuffer, 0, numData.buffer);
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