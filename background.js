chrome.runtime.onInstalled.addListener(async () => {
  chrome.contextMenus.create({
    id: "ask-all-llms",
    title: "Ask all LLMs",
    type: "normal",
    contexts: ["selection"],
    documentUrlPatterns: ["*://*/*"],
    targetUrlPatterns: ["*://*/*"],
  });
});

const LLMs = [
  {
    url: `https://chat.openai.com`,
    textarea: `textarea#prompt-textarea`,
    submit: `button[data-testid="send-button"]`,
  },
  {
    url: `https://gemini.google.com/`,
    textarea: `div.ql-editor.textarea`,
    submit: `button.send-button`,
  },
  {
    url: `https://claude.ai/chats`,
    textarea: `div.ProseMirror`,
    submit: `[data-value="new chat"] button`,
  },
  {
    url: `https://www.perplexity.ai/`,
    textarea: `textarea[autofocus]`,
    submit: `button:has(svg[data-icon="arrow-right"])`, // ユーティリティクラスばかりで絞りづらかった…
  },
];

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const { selectionText, menuItemId, pageUrl } = info;

  const getSelectionText = async () => {
    const tabId = tab?.id;
    if (!tabId) {
      throw new Error("tabId is not found");
    }
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          const selection = window.getSelection();
          return selection?.toString();
        },
      });
      const result = results[0].result;
      if (typeof result === "string") {
        return result;
      }
    } catch (error) {
      console.error(error);
    }
    if (!selectionText) {
      throw new Error("selectionText is not found");
    }
    return selectionText; // 改行が半角スペースになってしまう
  };

  switch (menuItemId) {
    case "ask-all-llms": {
      const selectionText = await getSelectionText();
      console.log(selectionText);

      for (const llm of LLMs) {
        // 今開いているサービスなら無視する
        if (new URL(pageUrl).origin === new URL(llm.url).origin) {
          continue;
        }

        const openedTab = await chrome.tabs.create({
          url: llm.url,
        });
        const openedTabId = openedTab.id;
        if (!openedTabId) {
          console.log(openedTab);
          throw new Error("tabId is not found");
        }

        chrome.tabs.onUpdated.addListener(async function listener(
          tabId,
          changeInfo
        ) {
          if (tabId !== openedTabId) {
            return; // 関係ないタブ
          }
          if (changeInfo.status !== "complete") {
            return; // ロード中
          }

          console.log(`Tab with ID: ${openedTabId} has completed loading.`);
          chrome.tabs.onUpdated.removeListener(listener);

          await chrome.scripting.executeScript({
            world: "ISOLATED",
            target: { tabId: openedTabId },
            args: [selectionText, JSON.stringify(llm)],
            func: (selectionText, json) => {
              /** @type {(typeof LLMs)[number]} */
              const llm = JSON.parse(json);
              const textarea = document.querySelector(llm.textarea);
              if (!textarea) {
                throw new Error("textarea not found");
              }
              if (textarea instanceof HTMLTextAreaElement) {
                textarea.value = selectionText;
                textarea.dispatchEvent(new Event("input", { bubbles: true }));
              }
              if (textarea instanceof HTMLDivElement) {
                textarea.textContent = selectionText;
              }

              /** @type {HTMLButtonElement | null} */
              const button = document.querySelector(llm.submit);
              if (!button) {
                throw new Error("button not found");
              }

              // ChatGPTはすぐに送信ボタンを押すと3.5になるので、少し待つ
              window.setTimeout(() => {
                button.click();
              }, 700);
            },
          });
        });
      }

      break;
    }
    default:
      break;
  }
});
