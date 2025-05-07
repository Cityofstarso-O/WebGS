@group(0) @binding(0) var<storage, read> Instance : array<f32>;

struct VertexOutput {
    @builtin(position) position : vec4<f32>,
    @location(0) out_color : vec4<f32>,
    @location(1) out_position : vec2<f32>,
};

@vertex
fn vert_main(
    @builtin(vertex_index) vertex_index : u32,
    @builtin(instance_index) instance_index : u32
) -> VertexOutput {
    let index = instance_index;
    let ndc_position = vec3<f32>(Instance[index * 10 + 0], Instance[index * 10 + 1], Instance[index * 10 + 2]);
    let scale = vec2<f32>(Instance[index * 10 + 3], Instance[index * 10 + 4]);
    let theta = Instance[index * 10 + 5];
    let color = vec4<f32>(Instance[index * 10 + 6], Instance[index * 10 + 7], Instance[index * 10 + 8], Instance[index * 10 + 9]);

    // quad positions (-1, -1), (-1, 1), (1, -1), (1, 1), ccw in screen space.
    let position = vec2<f32>(f32(vertex_index / 2u), f32(vertex_index % 2u)) * 2.0 - 1.0;

    let rot = mat2x2<f32>(cos(theta), sin(theta), -sin(theta), cos(theta));

    let confidence_radius = 3.0;

    let pos = ndc_position + vec3<f32>(rot * (scale * position) * confidence_radius, 0.0);
    
    var out: VertexOutput;
    out.position = vec4<f32>(pos, 1.0);
    out.out_color = color;
    out.out_position = position * confidence_radius;
    return out;
}


@fragment
fn frag_main(
    @location(0) in_color : vec4<f32>, 
    @location(1) in_position : vec2<f32>
) -> @location(0) vec4<f32> {
    /*
    @notice: the calculation of power factor might be wrong. check later
    */
    let gaussian_alpha = exp(-0.5f * dot(in_position, in_position));
    let alpha = in_color.a * gaussian_alpha;
    // premultiplied alpha
    return vec4(in_color.rgb * alpha, alpha);
}