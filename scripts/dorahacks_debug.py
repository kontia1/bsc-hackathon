import asyncio, json, os, sys
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()
        page = await context.new_page()

        await page.goto("https://dorahacks.io/login", timeout=20000)
        # Wait for SPA to render
        await page.wait_for_timeout(5000)
        print("PAGE_LOADED", flush=True)

        # Debug: dump all inputs with full attributes
        html = await page.content()
        # Find all input elements
        import re
        inputs_raw = re.findall(r'<input[^>]*>', html)
        for i, inp in enumerate(inputs_raw):
            print(f"  HTML input[{i}]: {inp[:200]}", flush=True)

        # Also check for shadow DOM or iframe
        frames = page.frames
        print(f"FRAMES: {len(frames)}", flush=True)
        for i, frame in enumerate(frames):
            print(f"  frame[{i}]: {frame.url}", flush=True)

        # Try to find ANY input
        all_inputs = await page.query_selector_all('input, textarea')
        print(f"TOTAL_INPUTS: {len(all_inputs)}", flush=True)
        for i, el in enumerate(all_inputs):
            tag = await el.evaluate('el => el.tagName')
            ph = await el.get_attribute('placeholder')
            tp = await el.get_attribute('type')
            nm = await el.get_attribute('name')
            print(f"  [{i}] {tag} type={tp} name={nm} placeholder={ph}", flush=True)

        # Try role-based selector
        textboxes = await page.query_selector_all('[role="textbox"]')
        print(f"TEXTBOXES: {len(textboxes)}", flush=True)

        # Try label-based
        labels = await page.query_selector_all('label')
        print(f"LABELS: {len(labels)}", flush=True)
        for i, label in enumerate(labels):
            txt = await label.inner_text()
            print(f"  label[{i}]: {txt[:100]}", flush=True)

        # Save screenshot for debug
        await page.screenshot(path="/tmp/dorahacks_login.png")
        print("SCREENSHOT: /tmp/dorahacks_login.png", flush=True)

        # Save HTML
        with open("/tmp/dorahacks_login.html", "w") as f:
            f.write(html)
        print(f"HTML: /tmp/dorahacks_login.html ({len(html)} bytes)", flush=True)

        await browser.close()

asyncio.run(main())
