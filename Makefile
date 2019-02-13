DIST := dist/
DEV := dev/

prepare:
	mkdir -p ${DIST}
	cp -R assets lib *.js LICENSE popup.html ${DIST}

firefox: DIST := ${DIST}/firefox
firefox: prepare
	cp platform/firefox/* ${DIST}
	cd ${DIST}; zip -r StickyDucky.zip *

chromium: DIST := ${DIST}/chromium
chromium: prepare
	cp platform/chromium/* ${DIST}
	cd ${DIST}; zip -r StickyDucky.zip *

safari: DIST := ${DIST}/StickyDucky.safariextension
safari: prepare
	cp platform/safari/* ${DIST}
	cp assets/icon128.png ${DIST}/Icon.png
	cp assets/icon48.png ${DIST}/Icon-48.png
	cp assets/icon128.png ${DIST}/Icon-128.png

clean:
	rm -rf ${DIST}
