@group(0) @binding(0) var<uniform> Camera : CameraInfo;

@group(1) @binding(0) var<storage, read> Pos : array<vec3<f32>>;

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

  	let pos: vec4<f32> = vec4<f32>(Pos[id], 1.0);
  	var transformed_pos : vec4<f32> = Camera.proj * Camera.view * pos;
  	transformed_pos = transformed_pos / transformed_pos.w;
  	let depth : f32 = transformed_pos.z;

  	if (abs(transformed_pos.x) <= 1.0 + Camera.frustumDilation && abs(transformed_pos.y) <= 1.0 + Camera.frustumDilation && depth >= 0.0 && depth <= 1.0) {
  	  	let instance_index : u32 = atomicAdd(&VisibleNum, 1);
  	  	Key[instance_index] = bitcast<u32>(1.0 - depth);
  	  	Index[instance_index] = id;
  	}
}