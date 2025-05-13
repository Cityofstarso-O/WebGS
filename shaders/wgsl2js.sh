#!/bin/bash

for file in *.wgsl; do
    filename=$(basename -- "$file" .wgsl)
    
    echo "const ${filename}_wgsl = \`" > "./${filename}.js"
    cat "$file" >> "./${filename}.js"
    echo "\`;" >> "./${filename}.js"
    echo "export default ${filename}_wgsl;" >> "./${filename}.js"
    
    echo "Generated ${filename}.js"
done

echo "All .wgsl files have been processed."