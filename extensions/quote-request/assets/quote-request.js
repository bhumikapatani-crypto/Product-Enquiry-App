(() => {
  if (customElements.get("quote-request")) return;

  const ALLOWED_FILE_TYPES = new Set([
    "application/pdf",
    "image/png",
    "image/jpeg",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ]);

  class QuoteRequest extends HTMLElement {
    connectedCallback() {
      this.dialog = this.querySelector("dialog");
      this.form = this.querySelector("[data-pqr-form]");
      this.trigger = this.querySelector(".pqr__trigger");
      this.notice = this.querySelector("[data-pqr-notice]");
      this.submitButton = this.querySelector("[data-pqr-submit]");
      this.trigger?.addEventListener("click", () => this.open());
      this.querySelectorAll("[data-pqr-close]").forEach((button) =>
        button.addEventListener("click", () => this.close()),
      );
      this.dialog?.addEventListener("click", (event) => {
        if (event.target === this.dialog) this.close();
      });
      this.dialog?.addEventListener("close", () => this.trigger?.focus());
      this.form?.addEventListener("submit", (event) => this.submit(event));
      this.form?.addEventListener("input", (event) => {
        if (event.target instanceof HTMLElement) event.target.removeAttribute("aria-invalid");
      });
      document.addEventListener("variant:change", (event) => this.updateVariant(event));
    }

    open() {
      if (!this.dialog) return;
      this.syncSelectedVariant();
      this.clearNotice();
      if (typeof this.dialog.showModal === "function") this.dialog.showModal();
      else this.dialog.setAttribute("open", "");
      this.form?.querySelector("input:not([type='hidden'])")?.focus();
    }

    close() {
      if (!this.dialog) return;
      if (typeof this.dialog.close === "function") this.dialog.close();
      else this.dialog.removeAttribute("open");
    }

    validate() {
      if (!this.form) return false;
      this.form.querySelectorAll("[aria-invalid='true']").forEach((field) => field.removeAttribute("aria-invalid"));
      const fileInput = this.form.querySelector("input[type='file']");
      const file = fileInput?.files?.[0];
      if (file) {
        const maxBytes = Number(this.dataset.fileMaxBytes || 5242880);
        if (!ALLOWED_FILE_TYPES.has(file.type)) fileInput.setCustomValidity("Please select a supported file type.");
        else if (file.size > maxBytes) fileInput.setCustomValidity("The selected file is too large.");
        else fileInput.setCustomValidity("");
      }
      if (!this.form.checkValidity()) {
        const invalid = this.form.querySelector(":invalid");
        invalid?.setAttribute("aria-invalid", "true");
        invalid?.reportValidity();
        return false;
      }
      return true;
    }

    async submit(event) {
      event.preventDefault();
      this.syncSelectedVariant();
      if (!this.form || !this.validate()) return;
      this.setLoading(true);
      this.clearNotice();
      try {
        const response = await fetch(this.dataset.endpoint, {
          method: "POST",
          body: new FormData(this.form),
          headers: { Accept: "application/json" },
          credentials: "same-origin",
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || "We could not send your request. Please try again.");
        this.showNotice(result.message || "Your quote request has been sent.", "success");
        this.form.reset();
        this.submitButton?.focus();
        this.dispatchEvent(new CustomEvent("quote-request:submitted", { bubbles: true, detail: { id: result.id } }));
      } catch (error) {
        this.showNotice(error instanceof Error ? error.message : "We could not send your request.", "error");
      } finally {
        this.setLoading(false);
      }
    }

    updateVariant(event) {
      const variant = event.detail?.variant;
      if (!variant?.id || !this.form) return;
      const input = this.form.querySelector("[data-pqr-variant-id]");
      const title = this.form.querySelector("[data-pqr-variant-title]");
      if (input) input.value = String(variant.id);
      if (title && variant.title) title.textContent = variant.title;
    }

    syncSelectedVariant() {
      if (!this.form) return;
      const productFormVariant = document.querySelector("form[action*='/cart/add'] [name='id']");
      const quoteVariant = this.form.querySelector("[data-pqr-variant-id]");
      if (productFormVariant?.value && quoteVariant) quoteVariant.value = productFormVariant.value;
    }

    setLoading(loading) {
      if (this.submitButton) this.submitButton.disabled = loading;
      this.querySelector("[data-pqr-submit-label]")?.toggleAttribute("hidden", loading);
      this.querySelector("[data-pqr-loading]")?.toggleAttribute("hidden", !loading);
    }

    showNotice(message, state) {
      if (!this.notice) return;
      this.notice.textContent = message;
      this.notice.dataset.state = state;
      this.notice.hidden = false;
    }

    clearNotice() {
      if (!this.notice) return;
      this.notice.textContent = "";
      this.notice.hidden = true;
      delete this.notice.dataset.state;
    }
  }

  customElements.define("quote-request", QuoteRequest);
})();
