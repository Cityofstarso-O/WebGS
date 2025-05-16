# WebGS
WebGPU viewer for 3dGS/4dGS using GPU radix sort. Demo is available [here](https://cityofstarso-o.github.io/WebGS/).
## Features
- Fast GPU radix sort
  - less artifacts during spinning view
- Integrated with graphics pipeline
  - drawing gaussians using instancing indirectly
- Fully GPU tasks
  - Ply file parsing and depth sorting implemented in GPU
  - CPU only manages interaction logic
## Requirements
- adapter features
  - `subgroups`
  - `shader-f16`

- adapter limits
  - `maxComputeWorkgroupSizeX` = 512;
  - `maxComputeInvocationsPerWorkgroup` = 512;
  - `maxComputeWorkgroupStorageSize` = 20480;
  - `maxBufferSize` = `GlobalVar.MAX_SPLAT_COUNT` * 96;
  - `maxStorageBufferBindingSize` = `GlobalVar.MAX_SPLAT_COUNT` * 96;
  - `maxStorageBuffersPerShaderStage` = 10;
  
`GlobalVar.MAX_SPLAT_COUNT` is set to 2^23 and you are free to change.

- VRAM >= 4G
## Run
- drag the ply file into the page
- left drag to rotate
- press WASD to move 
## TODO
- [x] add 4DGS support
- [ ] add Spacetime-Full support 
- [ ] make PlyLoader in a second thread
- [ ] optimize details(gui, interaction, shaders, layouts)
- [ ] performance test
## Tips
I only test on windows, and Edge and Chrome should be ok, but Firefox didn't work. Make sure you have [check this tutorial](https://windowslovers.com/chrome-hardware-acceleration-guide/) to enable your browser to use dedicated GPU. Next, navigate to edge://flags/ or chrome://flags, and enable Force High Performance GPU flag again. This is my current configuration and if you are running on Windows it should work. Otherwise, you can also try to enable Unsafe WebGPU Support flag but note this is an unsafe flag. Maybe this will work on Linux.