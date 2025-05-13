echo "const parse_ply_comp_wgsl = \`" > ./parse_ply_comp_wgsl.js
cat ./parse_ply_comp.wgsl >> ./parse_ply_comp_wgsl.js
echo "\`;" >> ./parse_ply_comp_wgsl.js
echo "export default parse_ply_comp_wgsl;" >> ./parse_ply_comp_wgsl.js

echo "const rank_comp_wgsl = \`" > ./rank_comp_wgsl.js
cat ./rank_comp.wgsl >> ./rank_comp_wgsl.js
echo "\`;" >> ./rank_comp_wgsl.js
echo "export default rank_comp_wgsl;" >> ./rank_comp_wgsl.js

echo "const splat_wgsl = \`" > ./splat_wgsl.js
cat ./splat.wgsl >> ./splat_wgsl.js
echo "\`;" >> ./splat_wgsl.js
echo "export default splat_wgsl;" >> ./splat_wgsl.js

echo "const splat_debug = \`" > ./splat_debug.js
cat ./splat_debug.wgsl >> ./splat_debug.js
echo "\`;" >> ./splat_debug.js
echo "export default splat_debug;" >> ./splat_debug.js