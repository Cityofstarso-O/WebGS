enable f16;

@group(0) @binding(0) var<uniform> Camera : CameraInfo;

@group(1) @binding(0) var<storage, read_write> Pos : array<vec3<f32>>;
@group(1) @binding(1) var<storage, read_write> Cov3d : array<f32>;
@group(1) @binding(2) var<storage, read_write> Color : array<vec4<f32>>;
@group(1) @binding(3) var<storage, read_write> SH : array<vec4<f16>>;

@group(2) @binding(1) var<storage, read_write> Index : array<u32>;

@group(3) @binding(0) var<storage, read_write> Debug : array<f32>;

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
fn main (
    @builtin(global_invocation_id) gid: vec3u,
    @builtin(local_invocation_id) lid: vec3u,
) {
    // debug code here
    
}