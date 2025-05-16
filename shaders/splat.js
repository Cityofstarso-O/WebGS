const splat_wgsl = `
enable f16;

@group(0) @binding(0) var<uniform> Camera : CameraInfo;

@group(1) @binding(0) var<storage, read> Pos : array<f32>;
@group(1) @binding(1) var<storage, read> Cov3d : array<f32>;
@group(1) @binding(2) var<storage, read> Color : array<vec4<f32>>;
@group(1) @binding(3) var<storage, read> SH : array<vec4<f16>>;

@group(2) @binding(1) var<storage, read> Index : array<u32>;

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

struct VertexOutput {
    @builtin(position) position : vec4<f32>,
    @location(0) outFragCol : vec4<f32>,
    @location(1) outFragPos : vec2<f32>,
};

const sqrt8: f32 = 2.8284271247462;

@vertex
fn vert_main(
    @builtin(vertex_index) vertex_index : u32,
    @builtin(instance_index) instance_index : u32
) -> VertexOutput {
    var out: VertexOutput;
    let splatIndex = Index[instance_index];

    var splatColor = Color[splatIndex];
    if(splatColor.a < Camera.alphaCullingThreshold) {
        out.position = vec4(0.0, 0.0, 2.0, 1.0);
        return out;
    }
    // quad positions (-1, -1), (-1, 1), (1, -1), (1, 1), ccw in screen space.
    let inPosition = vec3<f32>(f32(vertex_index / 2u) * 2.0 - 1.0, f32(vertex_index % 2u) * 2.0 - 1.0, 0.0);
    let splatCenter = vec3<f32>(Pos[splatIndex * 3 + 0], Pos[splatIndex * 3 + 1], Pos[splatIndex * 3 + 2]);

    let transformModelViewMatrix = Camera.view;
    let viewCenter = transformModelViewMatrix * vec4<f32>(splatCenter, 1.0);
    let clipCenter = Camera.proj * viewCenter;

    let fragPos = inPosition.xy;
    out.outFragPos = fragPos * sqrt8;

    let worldViewDir = normalize(splatCenter - Camera.camPos);
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
    let x = worldViewDir.x;
    let y = worldViewDir.y;
    let z = worldViewDir.z;
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

    let sh0 = mat3x4<f32>(mat3x4<f16>(SH[splatIndex * 12 + 0], SH[splatIndex * 12 + 4], SH[splatIndex * 12 +  8]));
    let sh1 = mat3x4<f32>(mat3x4<f16>(SH[splatIndex * 12 + 1], SH[splatIndex * 12 + 5], SH[splatIndex * 12 +  9]));
    let sh2 = mat3x4<f32>(mat3x4<f16>(SH[splatIndex * 12 + 2], SH[splatIndex * 12 + 6], SH[splatIndex * 12 + 10]));
    let sh3 = mat3x4<f32>(mat3x4<f16>(SH[splatIndex * 12 + 3], SH[splatIndex * 12 + 7], SH[splatIndex * 12 + 11]));

    var color: vec3<f32> = basis0 * sh0 + basis1 * sh1 + basis2 * sh2 + basis3 * sh3;
    color = max(color + 0.5, vec3<f32>(0.0));
    splatColor = vec4<f32>(color, splatColor.a);
    out.outFragCol = splatColor;

    let v0 = vec3<f32>(Cov3d[splatIndex * 6 + 0], Cov3d[splatIndex * 6 + 1], Cov3d[splatIndex * 6 + 2]);
    let v1 = vec3<f32>(Cov3d[splatIndex * 6 + 3], Cov3d[splatIndex * 6 + 4], Cov3d[splatIndex * 6 + 5]);
    let Vrk = mat3x3<f32>(
        v0.x, v0.y, v0.z,
        v0.y, v1.x, v1.y,
        v0.z, v1.y, v1.z
    );
    let s = 1.0 / (viewCenter.z * viewCenter.z);
    let J = mat3x3<f32>(
        Camera.focal.x / viewCenter.z, 0.0, -(Camera.focal.x * viewCenter.x) * s,
        0.0, Camera.focal.y / viewCenter.z, -(Camera.focal.y * viewCenter.y) * s,
        0.0, 0.0, 0.0
    );
    let W = transpose(mat3x3<f32>(
        transformModelViewMatrix[0].xyz,
        transformModelViewMatrix[1].xyz,
        transformModelViewMatrix[2].xyz,
    ));
    let T = W * J;
    var cov2Dm = transpose(T) * Vrk * T;
    cov2Dm[0][0] += 0.3;
    cov2Dm[1][1] += 0.3;

    let ndcCenter = clipCenter.xyz / clipCenter.w;

    let a = cov2Dm[0][0];
    let d = cov2Dm[1][1];
    let b = cov2Dm[0][1];
    let D = a * d - b * b;
    let trace = a + d;
    let traceOver2 = 0.5 * trace;
    let term2 = sqrt(max(0.1, traceOver2 * traceOver2 - D));
    let eigenValue1 = traceOver2 + term2;
    let eigenValue2 = traceOver2 - term2;

    if(eigenValue2 <= 0.0) {
        out.position = vec4(0.0, 0.0, 2.0, 1.0);
        return out;
    }

    let eigenVector1 = normalize(vec2(b, eigenValue1 - a));
    let eigenVector2 = vec2(eigenVector1.y, -eigenVector1.x);

    let basisVector1 = eigenVector1 * Camera.scaleModifier * min(sqrt8 * sqrt(eigenValue1), 2048.0);
    let basisVector2 = eigenVector2 * Camera.scaleModifier * min(sqrt8 * sqrt(eigenValue2), 2048.0);

    let ndcOffset = vec2(fragPos.x * basisVector1 + fragPos.y * basisVector2)  * 2.0 * Camera.invClientViewport;

    let quadPos = vec4(ndcCenter.xy + ndcOffset, ndcCenter.z, 1.0);
    out.position = quadPos;
    return out;
}

@fragment
fn frag_main(
    @location(0) inSplatCol : vec4<f32>, 
    @location(1) inFragPos : vec2<f32>
) -> @location(0) vec4<f32> {
    let A = dot(inFragPos, inFragPos);
    if (A > 8.0) {
        discard;
    }
    let opacity = inSplatCol.a * exp(-0.5f * A);
    // premultiplied alpha
    return vec4(inSplatCol.rgb, opacity);
}`;
export default splat_wgsl;
