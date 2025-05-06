@group(0) @binding(1) var<uniform> PointCount : u32;

@group(2) @binding(2) var<storage, read_write> VisibleNum : u32;
@group(2) @binding(4) var<storage, read_write> Index : array<u32>;
@group(2) @binding(5) var<storage, read_write> Inverse : array<u32>;

const WORKGROUP_SIZE: u32 = 512;
@compute @workgroup_size(WORKGROUP_SIZE)
fn main(
    @builtin(global_invocation_id) gid: vec3u,
) {
    let id = gid.x;

    if (id >= VisibleNum) {
        return;
    }
    // webgpu only supports clear buffer with zero
    // so we use 'id + 1' instead of 'id'
    // so that 0 stands for invalid Inverse[]
    Inverse[Index[id]] = id + 1;
}