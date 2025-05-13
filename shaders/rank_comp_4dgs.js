const rank_comp_4dgs_wgsl = `
@group(0) @binding(0) var<uniform> Camera : CameraInfo;

@group(1) @binding(0) var<storage, read> Pos : array<f32>;
@group(1) @binding(3) var<storage, read> Motion : array<f32>;
@group(1) @binding(6) var<storage, read> TRBF : array<f32>;

@group(2) @binding(0) var<storage, read_write> Key : array<u32>;
@group(2) @binding(1) var<storage, read_write> Index : array<u32>;

@group(3) @binding(0) var<storage, read_write> VisibleNum : atomic<u32>;

struct CameraInfo {
  	proj : mat4x4<f32>,
  	view : mat4x4<f32>,
  	camPos : vec3<f32>,
  	pointCnt : u32,
  	focal : vec2<f32>,
	viewport: vec2<f32>,
	invClientViewport: vec2<f32>,
	scaleModifier: f32,
	frustumDilation: f32,
	alphaCullingThreshold: f32,
	time: f32,
};

const WORKGROUP_SIZE: u32 = 512;
@compute @workgroup_size(WORKGROUP_SIZE)
fn main(
	@builtin(global_invocation_id) gid: vec3u,
) {
  	let id = gid.x;
  	if (id >= Camera.pointCnt) {
  	  	return;
  	}
	let deltaT = Camera.time - TRBF[id * 2];
	let deltaT2 = deltaT * deltaT;
	let a0 = vec3<f32>(Pos[id * 3 + 0], Pos[id * 3 + 1], Pos[id * 3 + 2]);
	let a1 = vec3<f32>(Motion[id * 9 + 0], Motion[id * 9 + 1], Motion[id * 9 + 2]);
	let a2 = vec3<f32>(Motion[id * 9 + 3], Motion[id * 9 + 4], Motion[id * 9 + 5]);
	let a3 = vec3<f32>(Motion[id * 9 + 6], Motion[id * 9 + 7], Motion[id * 9 + 8]);
	let pos = (a0 + a1 * deltaT) + (a2 + a3 * deltaT) * deltaT2;

  	var transformed_pos : vec4<f32> = Camera.proj * Camera.view * vec4<f32>(pos, 1.0);
  	transformed_pos = transformed_pos / transformed_pos.w;
  	let depth : f32 = transformed_pos.z;

  	if (abs(transformed_pos.x) <= 1.0 + Camera.frustumDilation && abs(transformed_pos.y) <= 1.0 + Camera.frustumDilation && depth >= 0.0 && depth <= 1.0) {
  	  	let instance_index : u32 = atomicAdd(&VisibleNum, 1);
  	  	Key[instance_index] = bitcast<u32>(1.0 - depth);
  	  	Index[instance_index] = id;
  	}
}`;
export default rank_comp_4dgs_wgsl;
