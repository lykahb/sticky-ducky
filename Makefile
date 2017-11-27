prepare:
	mkdir -p dist/
	rsync -a --exclude='.*' assets lib *.js LICENSE popup.html dist/

firefox: prepare
	cp platform/firefox/manifest.json dist/
	cd dist/; zip -r StickyDucky.zip *

chromium: prepare
	cp platform/chromium/manifest.json dist/
	cd dist/; zip -r StickyDucky.zip *

clean:
	rm -r dist/