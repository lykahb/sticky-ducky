DIST := dist/

prepare:
	mkdir -p ${DIST}
	rsync -a --exclude='.*' assets lib *.js LICENSE popup.html ${DIST}

firefox: DIST := dist/firefox
firefox: prepare
	cp platform/firefox/* ${DIST}
	cd ${DIST}; zip -r StickyDucky.zip *

chromium: DIST := dist/chromium
chromium: prepare
	cp platform/chromium/* ${DIST}
	cd ${DIST}; zip -r StickyDucky.zip *

safari: DIST := dist/StickyDucky.safariextension
safari: prepare
	cp platform/safari/* ${DIST}

clean:
	rm -rf dist/