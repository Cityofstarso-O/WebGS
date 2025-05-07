# WebGS
WebGPU viewer for 3dGS/4dGS using GPU radix sort.
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
  - `maxBufferSize` = `Device.MAX_SPLAT_COUNT` * 96;
  - `maxStorageBufferBindingSize` = `Device.MAX_SPLAT_COUNT` * 96;
  - `maxStorageBuffersPerShaderStage` = 10;
  
`Device.MAX_SPLAT_COUNT` is set to 2^23 and you are free to change.

- VRAM >= 4G
## Run
> This project is still in developement. You can use VSCode `Go Live` extension to preview it.

- drag the ply file into the page
- left drag to rotate
- press WASD to move 
## TODO
- [ ] add 4DGS support
- [ ] make PlyLoader in a second thread
- [ ] optimize details(gui, interaction, shaders, layouts)
- [ ] performance test
## Tips
Chrome135 is highly recommended(my use). To activate your dedicated GPU(if there is), [check this tutorial](https://windowslovers.com/chrome-hardware-acceleration-guide/) to achieve higher performance.
