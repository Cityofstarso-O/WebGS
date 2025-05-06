enable f16;

@group(0) @binding(0) var<uniform> Camera : CameraInfo;
@group(0) @binding(1) var<uniform> PointCount : u32;

@group(1) @binding(0) var<storage, read_write> Pos : array<f32>;
@group(1) @binding(1) var<storage, read_write> Cov3d : array<f32>;
@group(1) @binding(2) var<storage, read_write> Opacity : array<f32>;
@group(1) @binding(3) var<storage, read_write> SH : array<vec4<f16>>;

@group(2) @binding(0) var<storage, read_write> DrawIndirect : DrawIndirectInfo;
@group(2) @binding(1) var<storage, read_write> Instance : array<f32>; // 3:position, 3:rot, 4:color
@group(2) @binding(2) var<storage, read_write> VisibleNum : u32;
@group(2) @binding(5) var<storage, read_write> Inverse : array<u32>;

struct CameraInfo {
  	projection : mat4x4<f32>,
  	view : mat4x4<f32>,
  	camera_position : vec3<f32>,
  	pad0 : f32,
  	screen_size : vec2<u32>,
};

struct DrawIndirectInfo {
    indexCount : u32,
    instanceCount : u32,
    firstIndex : u32,
    vertexOffset : i32,
    firstInstance : u32,
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

    if (id == 0u) {
        DrawIndirect.indexCount = 6u;
        DrawIndirect.instanceCount = VisibleNum;
        DrawIndirect.firstIndex = 0u;
        DrawIndirect.vertexOffset = 0;
        DrawIndirect.firstInstance = 0u;
    }

    var inverse_id = Inverse[id];
    if (inverse_id == 0u) {
        return;
    }
    inverse_id -= 1u;

    let v0 = vec3<f32>(Cov3d[id * 6 + 0], Cov3d[id * 6 + 1], Cov3d[id * 6 + 2]);
    let v1 = vec3<f32>(Cov3d[id * 6 + 3], Cov3d[id * 6 + 4], Cov3d[id * 6 + 5]);
    var pos = vec4<f32>(Pos[id * 3 + 0], Pos[id * 3 + 1], Pos[id * 3 + 2], 1.0);

    let camera_model_position = vec4<f32>(Camera.camera_position, 1.0);
    let dir = normalize(pos.xyz - camera_model_position.xyz);

    var cov3d = mat3x3<f32>(
        v0.x, v0.y, v0.z,
        v0.y, v1.x, v1.y,
        v0.z, v1.y, v1.z
    );

    let view3d = mat3x3<f32>(
        Camera.view[0].xyz, 
        Camera.view[1].xyz, 
        Camera.view[2].xyz, 
    );
    cov3d = view3d * cov3d * transpose(view3d);
    pos = Camera.view * pos;

    let inverse_r = 1.0 / length(pos.xyz);
    let J = mat3x3<f32>(
        -1.0 / pos.z, 0.0, -2.0 * pos.x * inverse_r,
        0.0, -1.0 / pos.z, -2.0 * pos.y * inverse_r,
        pos.x / (pos.z * pos.z), pos.y / (pos.z * pos.z), -2.0 * pos.z * inverse_r
    );
    cov3d = J * cov3d * transpose(J);

    let projection_scale = mat2x2<f32>(Camera.projection[0].xy, Camera.projection[1].xy);
    var cov2d = projection_scale * mat2x2<f32>(cov3d[0].xy, cov3d[1].xy) * projection_scale;

    cov2d[0][0] += 1.0 / f32(Camera.screen_size.x * Camera.screen_size.x);
    cov2d[1][1] += 1.0 / f32(Camera.screen_size.y * Camera.screen_size.y);

    let a = cov2d[0][0];
    let b = cov2d[1][1];
    let c = cov2d[1][0];
    let D = sqrt((a - b) * (a - b) + 4.0 * c * c);
    let s0 = sqrt(0.5 * (a + b + D));
    let s1 = sqrt(0.5 * (a + b - D));
    let sin2t = 2.0 * c / D;
    let cos2t = (a - b) / D;
    let theta = atan2(sin2t, cos2t) / 2.0;

    pos = Camera.projection * pos;
    pos = pos / pos.w;

    const  C0: f32 = 0.28209479177387814;
    const  C1: f32 = 0.4886025119029199;
    const C20: f32 = 1.0925484305920792;
    const C21: f32 = 0.31539156525252005;
    const C22: f32 = 0.5462742152960396;
    const C30: f32 = 0.5900435899266435;
    const C31: f32 = 2.890611442640554;
    const C32: f32 = 0.4570457994644658;
    const C33: f32 = 0.3731763325901154;
    const C34: f32 = 1.445305721320277;
    let x = dir.x;
    let y = dir.y;
    let z = dir.z;
    let xx = x * x;
    let yy = y * y;
    let zz = z * z;
    let xy = x * y;
    let yz = y * z;
    let xz = x * z;
    let basis0 = vec4<f32>(C0, -C1 * y, C1 * z, -C1 * x);
    let basis1 = vec4<f32>(C20 * xy, -C20 * yz, C21 * (2.0 * zz - xx - yy), -C20 * xz);
    let basis2 = vec4<f32>(C22 * (xx - yy), -C30 * y * (3.0 * xx - yy), C31 * xy * z, -C32 * y * (4.0 * zz - xx - yy));
    let basis3 = vec4<f32>(C33 * z * (2.0 * zz - 3.0 * xx - 3.0 * yy), -C32 * x * (4.0 * zz - xx - yy), C34 * z * (xx - yy), -C30 * x * (xx - 3.0 * yy));

    let sh0 = mat3x4<f32>(mat3x4<f16>(SH[id * 12 + 0], SH[id * 12 + 4], SH[id * 12 +  8]));
    let sh1 = mat3x4<f32>(mat3x4<f16>(SH[id * 12 + 1], SH[id * 12 + 5], SH[id * 12 +  9]));
    let sh2 = mat3x4<f32>(mat3x4<f16>(SH[id * 12 + 2], SH[id * 12 + 6], SH[id * 12 + 10]));
    let sh3 = mat3x4<f32>(mat3x4<f16>(SH[id * 12 + 3], SH[id * 12 + 7], SH[id * 12 + 11]));

    var color : vec3<f32> = basis0 * sh0 + basis1 * sh1 + basis2 * sh2 + basis3 * sh3;

    color = max(color + 0.5, vec3<f32>(0.0));
    let opacity = Opacity[id];

    Instance[inverse_id * 10 + 0] = pos.x;
    Instance[inverse_id * 10 + 1] = pos.y;
    Instance[inverse_id * 10 + 2] = pos.z;
    Instance[inverse_id * 10 + 3] = s0;
    Instance[inverse_id * 10 + 4] = s1;
    Instance[inverse_id * 10 + 5] = theta;
    Instance[inverse_id * 10 + 6] = color.r;
    Instance[inverse_id * 10 + 7] = color.g;
    Instance[inverse_id * 10 + 8] = color.b;
    Instance[inverse_id * 10 + 9] = opacity;
}