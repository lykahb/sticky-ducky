build:
	mkdir -p dist/
	rsync -a --exclude='.*' assets lib *.js LICENSE manifest.json popup.html dist/
	cd dist/; zip -r StickyDucky.zip *

clean:
	rm -r dist/