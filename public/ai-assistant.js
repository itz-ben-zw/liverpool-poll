(() => {
  const launcher = document.createElement("button");
  launcher.id = "stnd-ai-launcher";
  launcher.type = "button";
  launcher.setAttribute("aria-label", "Open STND. shopping assistant");
  launcher.setAttribute("aria-expanded", "false");
  launcher.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H6l-3 2v-6.5A7.5 7.5 0 1 1 20 11.5Z"/><path d="M8 11h8M8 14h5"/></svg>';

  const panel = document.createElement("section");
  panel.id = "stnd-ai-panel";
  panel.setAttribute("aria-label", "STND. AI shopping assistant");
  panel.setAttribute("aria-hidden", "true");
  panel.innerHTML = '<header class="stnd-ai-head"><div><div class="stnd-ai-brand">STND. / ASSISTANT</div><div class="stnd-ai-subtitle">Personal shopping · Customer care</div></div><button class="stnd-ai-close" type="button" aria-label="Close assistant">×</button></header><div class="stnd-ai-messages" role="log" aria-live="polite" aria-relevant="additions"></div><form class="stnd-ai-form"><input name="message" type="text" maxlength="600" autocomplete="off" placeholder="Ask about the collection…" aria-label="Your message"><button type="submit" aria-label="Send message">↑</button></form><div class="stnd-ai-note">AI suggestions are based on current store listings. Stock and prices can change.</div>';

  document.body.append(launcher, panel);
  const messages = panel.querySelector(".stnd-ai-messages");
  const form = panel.querySelector("form");
  const input = form.elements.message;
  const sendButton = form.querySelector("button");
  const history = [];
  let busy = false;

  function scrollBottom() { messages.scrollTop = messages.scrollHeight; }
  function addMessage(role, text) {
    const node = document.createElement("div");
    node.className = "stnd-ai-message " + role;
    node.textContent = text;
    messages.append(node);
    scrollBottom();
    return node;
  }
  function showWelcome() {
    const wrap = document.createElement("div");
    wrap.className = "stnd-ai-message assistant";
    const copy = document.createElement("div");
    copy.textContent = "Welcome to STND. I can help you find your next favourite piece or answer questions about shopping with us. What are you looking for?";
    const quick = document.createElement("div");
    quick.className = "stnd-ai-quick";
    [
      ["Help me find an outfit", "Help me find an outfit. Ask me what you need to know."],
      ["Show me what's available", "Show me a few pieces currently available."],
      ["Delivery & returns", "What should I know about delivery, payments and returns?"]
    ].forEach(([label, value]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.addEventListener("click", () => send(value));
      quick.append(button);
    });
    wrap.append(copy, quick);
    messages.append(wrap);
  }
  function toggle(open) {
    panel.classList.toggle("is-open", open);
    panel.setAttribute("aria-hidden", String(!open));
    launcher.setAttribute("aria-expanded", String(open));
    if (open) input.focus();
    else launcher.focus();
  }
  launcher.addEventListener("click", () => toggle(!panel.classList.contains("is-open")));
  panel.querySelector(".stnd-ai-close").addEventListener("click", () => toggle(false));
  showWelcome();

  function showProducts(products) {
    if (!Array.isArray(products) || !products.length) return;
    const list = document.createElement("div");
    list.className = "stnd-ai-products";
    products.forEach(product => {
      const card = document.createElement("article");
      card.className = "stnd-ai-product";
      const image = document.createElement("img");
      const imageUrl = typeof product.image === "string" && /^https:\/\//i.test(product.image) ? product.image : "";
      if (imageUrl) image.src = imageUrl;
      image.alt = product.name || "STND. product";
      image.loading = "lazy";
      const details = document.createElement("div");
      const name = document.createElement("strong");
      name.textContent = product.name || "STND. piece";
      const meta = document.createElement("small");
      meta.textContent = "$" + Number(product.price || 0).toFixed(2) + " · " + (product.category || "Collection") + " · " + Number(product.stock || 0) + " available";
      const view = document.createElement("button");
      view.type = "button";
      view.textContent = "View piece";
      view.setAttribute("data-view-product", String(product.id));
      details.append(name, meta, view);
      card.append(image, details);
      list.append(card);
    });
    messages.append(list);
    scrollBottom();
  }

  async function send(text) {
    const message = String(text || "").trim();
    if (!message || busy) return;
    addMessage("user", message);
    history.push({ role: "user", text: message });
    input.value = "";
    busy = true;
    sendButton.disabled = true;
    const typing = document.createElement("div");
    typing.className = "stnd-ai-typing";
    typing.textContent = "STND. is thinking…";
    messages.append(typing);
    scrollBottom();
    try {
      const response = await fetch("/api/assistant/chat", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history: history.slice(-8, -1) })
      });
      const data = await response.json().catch(() => ({}));
      typing.remove();
      if (!response.ok) throw new Error(data.error || "The assistant is unavailable right now.");
      const reply = typeof data.reply === "string" ? data.reply : "I can help you explore the STND. collection.";
      addMessage("assistant", reply);
      history.push({ role: "model", text: reply });
      showProducts(data.products);
      if (history.length > 12) history.splice(0, history.length - 12);
    } catch (error) {
      typing.remove();
      addMessage("assistant", error.message || "I couldn't reach the assistant. Please try again.");
    } finally {
      busy = false;
      sendButton.disabled = false;
      input.focus();
    }
  }

  form.addEventListener("submit", event => {
    event.preventDefault();
    send(input.value);
  });
})();