# Tips
对于有集显和独显的系统，edge和chrome均默认使用集显进行计算。为了充分发挥GPU的计算性能，可以根据以下步骤切换到独显（如n卡）
> 1.设置-系统-屏幕-选项卡，将要使用的浏览器的“图形首选项”改为高性能  

如果无效，可以尝试
> 2.打开Nvidia Control Panel，强制使用独显  

如果仍无效，可以尝试  
> 3.使用chrome，在chrome地址栏输入：chrome://flags/#ignore-gpu-blocklist，找到Override software rendering list选项，将其设为Enabled，重启浏览器

建议首选chrome，经测试我的edge一直无法切换到独显，使用chrome后只做了第一个步骤就成功了。