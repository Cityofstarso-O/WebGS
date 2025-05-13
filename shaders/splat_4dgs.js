const splat_4dgs_wgsl = `
enable f16;

@group(0) @binding(0) var<uniform> Camera : CameraInfo;

@group(1) @binding(0) var<storage, read> Pos : array<f32>;
@group(1) @binding(1) var<storage, read> Feature : array<f32>;
@group(1) @binding(2) var<storage, read> Color : array<vec4<f32>>;
@group(1) @binding(3) var<storage, read> Motion : array<f32>;
@group(1) @binding(4) var<storage, read> Scale : array<f32>;
@group(1) @binding(5) var<storage, read> Rot : array<vec4<f32>>;
@group(1) @binding(6) var<storage, read> TRBF : array<f32>;

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
    time: f32,
};

struct VertexOutput {
    @builtin(position) position : vec4<f32>,
    @location(0) outFragCol : vec4<f32>,
    @location(1) outFragPos : vec2<f32>,
};

const sqrt8: f32 = 2.8284271247462;

fn calcCov3d(id: u32, deltaT: f32) -> mat3x3<f32> {
    let s = vec3<f32>(Scale[3 * id + 0], Scale[3 * id + 1], Scale[3 * id + 2]);

    var q = Rot[2 * id + 0] + deltaT * Rot[2 * id + 1];
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
    return cov3d;
}

@vertex
fn vert_main(
    @builtin(vertex_index) vertex_index : u32,
    @builtin(instance_index) instance_index : u32
) -> VertexOutput {
    var out: VertexOutput;
    let splatIndex = Index[instance_index];

    let deltaT = Camera.time - TRBF[splatIndex * 2];
	let deltaT2 = deltaT * deltaT;
	let a0 = vec3<f32>(Pos[splatIndex * 3 + 0], Pos[splatIndex * 3 + 1], Pos[splatIndex * 3 + 2]);
	let a1 = vec3<f32>(Motion[splatIndex * 9 + 0], Motion[splatIndex * 9 + 1], Motion[splatIndex * 9 + 2]);
	let a2 = vec3<f32>(Motion[splatIndex * 9 + 3], Motion[splatIndex * 9 + 4], Motion[splatIndex * 9 + 5]);
	let a3 = vec3<f32>(Motion[splatIndex * 9 + 6], Motion[splatIndex * 9 + 7], Motion[splatIndex * 9 + 8]);
	let splatCenter = (a0 + a1 * deltaT) + (a2 + a3 * deltaT) * deltaT2;

    var splatColor = Color[splatIndex];
    splatColor.a = splatColor.a * exp(-TRBF[splatIndex * 2 + 1] * deltaT2);
    out.outFragCol = splatColor;
    
    if(splatColor.a < Camera.alphaCullingThreshold) {
        out.position = vec4(0.0, 0.0, 2.0, 1.0);
        return out;
    }
    // quad positions (-1, -1), (-1, 1), (1, -1), (1, 1), ccw in screen space.
    let inPosition = vec3<f32>(f32(vertex_index / 2u) * 2.0 - 1.0, f32(vertex_index % 2u) * 2.0 - 1.0, 0.0);

    let transformModelViewMatrix = Camera.view;
    let viewCenter = transformModelViewMatrix * vec4<f32>(splatCenter, 1.0);
    let clipCenter = Camera.proj * viewCenter;

    let fragPos = inPosition.xy;
    out.outFragPos = fragPos * sqrt8;

    let Vrk = calcCov3d(splatIndex, deltaT);
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
    return vec4(inSplatCol.rgb * opacity, opacity);
}`;
export default splat_4dgs_wgsl;
