const rank_comp_wgsl = `
@group(0) @binding(0) var<uniform> Camera : CameraInfo;
@group(0) @binding(1) var<uniform> PointCount : u32;

@group(1) @binding(0) var<storage, read_write> Pos : array<f32>;

@group(2) @binding(2) var<storage, read_write> VisibleNum : atomic<u32>;
@group(2) @binding(3) var<storage, read_write> Key : array<u32>;
@group(2) @binding(4) var<storage, read_write> Index : array<u32>;

struct CameraInfo {
  	projection : mat4x4<f32>,
  	view : mat4x4<f32>,
  	camera_position : vec3<f32>,
  	pad0 : f32,
  	screen_size : vec2<u32>,
};

const WORKGROUP_SIZE: u32 = 512;
@compute @workgroup_size(WORKGROUP_SIZE)
fn main(
	@builtin(global_invocation_id) gid: vec3u,
) {
  	let id = gid.x;
  	if (id >= PointCount) {
  	  	return;
  	}

  	let pos: vec4<f32> = vec4<f32>(Pos[id * 3 + 0], Pos[id * 3 + 1], Pos[id * 3 + 2], 1.0);
  	var transformed_pos : vec4<f32> = Camera.projection * Camera.view * pos;
  	transformed_pos = transformed_pos / transformed_pos.w;
  	let depth : f32 = transformed_pos.z;

  	if (abs(transformed_pos.x) <= 1.05 && abs(transformed_pos.y) <= 1.05 && depth >= 0.0 && depth <= 1.0) {
  	  	let instance_index : u32 = atomicAdd(&VisibleNum, 1);
  	  	Key[instance_index] = bitcast<u32>(1.0 - depth);
  	  	Index[instance_index] = id;
  	}
}`;
export default rank_comp_wgsl;
