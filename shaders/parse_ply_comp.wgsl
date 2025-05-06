enable f16;
@group(0) @binding(1) var<uniform> PointCount : u32;

@group(1) @binding(0) var<storage, read_write> Pos : array<f32>;
@group(1) @binding(1) var<storage, read_write> Cov3d : array<f32>;
@group(1) @binding(2) var<storage, read_write> Opacity : array<f32>;
@group(1) @binding(3) var<storage, read_write> SH : array<f16>;

// pos(3), scale(3), rot(4), sh(48), opacity(1)
@group(3) @binding(0) var<storage, read> Offsets : array<u32>;
@group(3) @binding(1) var<storage, read> Ply : array<f32>;

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

    if (id < PointCount) {
        let base = localOffsets[59];

        Pos[3 * id + 0] = Ply[base * id + localOffsets[0]];
        Pos[3 * id + 1] = Ply[base * id + localOffsets[1]];
        Pos[3 * id + 2] = Ply[base * id + localOffsets[2]];

        var s = vec3<f32>(
            Ply[base * id + localOffsets[3]], 
            Ply[base * id + localOffsets[4]], 
            Ply[base * id + localOffsets[5]]
        );
        s = exp(s);

        var q = vec4<f32>(
            Ply[base * id + localOffsets[6]], 
            Ply[base * id + localOffsets[7]], 
            Ply[base * id + localOffsets[8]], 
            Ply[base * id + localOffsets[9]]
        );
        q = q / length(q);

        let xx = q.x * q.x;
        let yy = q.y * q.y;
        let zz = q.z * q.z;
        let xy = q.x * q.y;
        let xz = q.x * q.z;
        let yz = q.y * q.z;
        let wx = q.w * q.x;
        let wy = q.w * q.y;
        let wz = q.w * q.z;
        let rot = mat3x3<f32>(
            1.0 - 2.0 * (yy + zz),
            2.0 * (xy + wz),
            2.0 * (xz - wy),
            2.0 * (xy - wz),
            1.0 - 2.0 * (xx + zz),
            2.0 * (yz + wx),
            2.0 * (xz + wy),
            2.0 * (yz - wx),
            1.0 - 2.0 * (xx + yy),
        );

        let ss = mat3x3<f32>(
            s.x * s.x, 0.0, 0.0,
            0.0, s.y * s.y, 0.0,
            0.0, 0.0, s.z * s.z
        );

        let cov3d = rot * ss * transpose(rot);

        Cov3d[6 * id + 0] = cov3d[0][0];
        Cov3d[6 * id + 1] = cov3d[1][0];
        Cov3d[6 * id + 2] = cov3d[2][0];
        Cov3d[6 * id + 3] = cov3d[1][1];
        Cov3d[6 * id + 4] = cov3d[2][1];
        Cov3d[6 * id + 5] = cov3d[2][2];

        for (var i = 0u; i < 48; i = i + 1u) {
            SH[48 * id + i] = f16(Ply[base * id + localOffsets[10 + i]]);
        }
    
        Opacity[id] = sigmoid(Ply[base * id + localOffsets[58]]);
    }
}