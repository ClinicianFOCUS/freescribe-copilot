export class LoadingSpinner {
    constructor() {
        this.loadingOverlay = null;
        this.loadingText = null;
        this.s2tLoader = null;
        this.init();
    }

    init() {
        this.loadingOverlay = document.getElementById('loadingOverlay');
        this.loadingText = document.getElementById('loadingText');
        this.s2tLoader = document.getElementById('s2t-loader');
    }

    show(message = 'Loading...') {
        if (this.loadingOverlay) {
            if (this.loadingText) {
                this.loadingText.textContent = message;
            }
            this.loadingOverlay.style.display = 'flex';
        }
    }

    hide() {
        if (this.loadingOverlay) {
            this.loadingOverlay.style.display = 'none';
        }
    }

    showS2T() {
        if (this.s2tLoader) {
            this.s2tLoader.style.display = 'block';
        }
    }

    hideS2T() {
        if (this.s2tLoader) {
            this.s2tLoader.style.display = 'none';
        }
    }

+    static DEFAULT_LOADING_MESSAGE = 'Loading models...';
+
+    reset() {
+        this.hide();
+        if (this.loadingText) {
+            this.loadingText.textContent = LoadingSpinner.DEFAULT_LOADING_MESSAGE;
+        }
+    }
}