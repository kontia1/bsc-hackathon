import asyncio, json, os
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        # Connect to running Camofox via CDP/Juggler
        # Try connecting via the Camofox API port
        try:
            browser = await p.firefox.connect_over_cdp("http://127.0.0.1:9377")
            print("Connected via CDP 9377", flush=True)
        except Exception as e:
            print(f"CDP 9377 failed: {e}", flush=True)
            # Try direct Juggler pipe
            try:
                browser = await p.firefox.connect("http://127.0.0.1:9377")
                print("Connected via Juggler 9377", flush=True)
            except Exception as e2:
                print(f"Juggler 9377 failed: {e2}", flush=True)
                return

        # Get existing context and page
        contexts = browser.contexts
        print(f"Contexts: {len(contexts)}", flush=True)
        
        if contexts:
            context = contexts[0]
            pages = context.pages
            print(f"Pages: {len(pages)}", flush=True)
            
            if pages:
                page = pages[0]
                print(f"Current URL: {page.url}", flush=True)
            else:
                page = await context.new_page()
        else:
            print("No contexts found", flush=True)
            return

        # Navigate to DoraHacks login
        await page.goto("https://dorahacks.io/login", wait_until="domcontentloaded", timeout=15000)
        await page.wait_for_timeout(3000)
        print(f"Page: {page.url}", flush=True)

        # Set email via native setter
        await page.evaluate('''() => {
            const input = document.querySelector('input[placeholder*="email" i]') || document.querySelectorAll('input')[0];
            if (input) {
                const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                nativeSetter.call(input, 'kontiasuu@gmail.com');
                input.dispatchEvent(new Event('input', {bubbles: true}));
                input.dispatchEvent(new Event('change', {bubbles: true}));
            }
        }''')
        print("Email set", flush=True)

        # Click Get Code
        await page.evaluate('''() => {
            const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Get Code'));
            if (btn) btn.click();
        }''')
        print("Get Code clicked", flush=True)

        # Wait for code from stdin
        print("WAITING_CODE", flush=True)
        import sys
        code = sys.stdin.readline().strip()
        print(f"GOT_CODE: {code}", flush=True)

        # Enter code
        await page.evaluate(f'''() => {{
            const input = document.querySelector('input[placeholder*="code" i]') || document.querySelectorAll('input')[1];
            if (input) {{
                const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                nativeSetter.call(input, '{code}');
                input.dispatchEvent(new Event('input', {{bubbles: true}}));
                input.dispatchEvent(new Event('change', {{bubbles: true}}));
            }}
        }}''')
        print("Code entered", flush=True)

        # Enable and click Continue
        await page.evaluate('''() => {
            const btns = Array.from(document.querySelectorAll('button')).filter(b => b.textContent.includes('Continue'));
            for (const btn of btns) {
                btn.disabled = false;
                btn.removeAttribute('disabled');
            }
            const btn = btns.find(b => !b.textContent.includes('Google') && !b.textContent.includes('Github'));
            if (btn) btn.click();
        }''')
        print("Continue clicked", flush=True)

        # Wait for result
        await page.wait_for_timeout(8000)
        print(f"Final URL: {page.url}", flush=True)

        # Get cookies
        cookies = await context.cookies()
        dorahacks_cookies = [c for c in cookies if 'dorahacks' in c.get('domain', '')]
        print(f"DoraHacks cookies: {len(dorahacks_cookies)}", flush=True)
        
        for c in dorahacks_cookies:
            print(f"  {c['name']}: {c['value'][:50]}", flush=True)

        # Save cookies
        cred_path = os.path.expanduser("~/.agent/credentials/dorahacks-cookies.json")
        with open(cred_path, "w") as f:
            json.dump(dorahacks_cookies, f, indent=2)
        print(f"SAVED: {cred_path}", flush=True)

        if '/login' not in page.url:
            print("LOGIN_SUCCESS", flush=True)
        else:
            print("LOGIN_FAILED", flush=True)

asyncio.run(main())
