enable f16;

@group(0) @binding(0) var<uniform> Camera : CameraInfo;

@group(1) @binding(0) var<storage, read_write> Pos : array<f32>;
@group(1) @binding(1) var<storage, read_write> Feature : array<f32>;
@group(1) @binding(2) var<storage, read_write> Color : array<f32>;
@group(1) @binding(3) var<storage, read_write> Motion : array<f32>;
@group(1) @binding(4) var<storage, read_write> Scale : array<f32>;
@group(1) @binding(5) var<storage, read_write> Rot : array<f32>;
@group(1) @binding(6) var<storage, read_write> TRBF : array<f32>;

// pos(3), scale(3), rot(4), sh(48), opacity(1)
@group(3) @binding(0) var<storage, read> Offsets : array<u32>;
@group(3) @binding(1) var<storage, read> Ply : array<f32>;

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

var<workgroup> localOffsets : array<u32, 60>;

fn sigmoid(x : f32) -> f32 {
    return 1.0 / (1.0 + exp(-x));
}

const WORKGROUP_SIZE: u32 = 512;
@compute @workgroup_size(WORKGROUP_SIZE)
fn main (
    @builtin(global_invocation_id) gid: vec3u,
    @builtin(local_invocation_id) lid: vec3u,
) {
    let id: u32 = gid.x;

    if (lid.x < 60u) {
        localOffsets[lid.x] = Offsets[lid.x];
    }
    workgroupBarrier();

    if (id < Camera.pointCnt) {
        let base = localOffsets[59];

        Pos[3 * id + 0] = Ply[base * id + localOffsets[0]];
        Pos[3 * id + 1] = Ply[base * id + localOffsets[1]];
        Pos[3 * id + 2] = Ply[base * id + localOffsets[2]];

        Scale[3 * id + 0] = exp(Ply[base * id + localOffsets[3]]);
        Scale[3 * id + 1] = exp(Ply[base * id + localOffsets[4]]);
        Scale[3 * id + 2] = exp(Ply[base * id + localOffsets[5]]);

        Rot[8 * id + 0] = Ply[base * id + localOffsets[6]];
        Rot[8 * id + 1] = Ply[base * id + localOffsets[7]];
        Rot[8 * id + 2] = Ply[base * id + localOffsets[8]];
        Rot[8 * id + 3] = Ply[base * id + localOffsets[9]];

        Color[4 * id + 0] = Ply[base * id + localOffsets[10]];
        Color[4 * id + 1] = Ply[base * id + localOffsets[11]];
        Color[4 * id + 2] = Ply[base * id + localOffsets[12]];
        Color[4 * id + 3] = sigmoid(Ply[base * id + localOffsets[13]]);

        TRBF[2 * id + 0] = Ply[base * id + localOffsets[14]];
        let trbf_scale = exp(-Ply[base * id + localOffsets[15]]);
        TRBF[2 * id + 1] = trbf_scale * trbf_scale;

        Motion[9 * id + 0] = Ply[base * id + localOffsets[16]];
        Motion[9 * id + 1] = Ply[base * id + localOffsets[17]];
        Motion[9 * id + 2] = Ply[base * id + localOffsets[18]];
        Motion[9 * id + 3] = Ply[base * id + localOffsets[19]];
        Motion[9 * id + 4] = Ply[base * id + localOffsets[20]];
        Motion[9 * id + 5] = Ply[base * id + localOffsets[21]];
        Motion[9 * id + 6] = Ply[base * id + localOffsets[22]];
        Motion[9 * id + 7] = Ply[base * id + localOffsets[23]];
        Motion[9 * id + 8] = Ply[base * id + localOffsets[24]];

        Rot[8 * id + 4] = Ply[base * id + localOffsets[26]];
        Rot[8 * id + 5] = Ply[base * id + localOffsets[27]];
        Rot[8 * id + 6] = Ply[base * id + localOffsets[28]];
        Rot[8 * id + 7] = Ply[base * id + localOffsets[25]];
    }
}