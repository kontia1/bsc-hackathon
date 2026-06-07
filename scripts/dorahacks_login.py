import asyncio, json, os, sys
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()
        page = await context.new_page()

        await page.goto("https://dorahacks.io/login", wait_until="domcontentloaded", timeout=15000)
        await page.wait_for_timeout(3000)
        print("PAGE_LOADED", flush=True)

        # Debug: dump all inputs
        inputs = await page.query_selector_all('input')
        for i, inp in enumerate(inputs):
            ph = await inp.get_attribute('placeholder')
            tp = await inp.get_attribute('type')
            print(f"  input[{i}]: type={tp} placeholder={ph}", flush=True)

        # Find email input - try multiple selectors
        email_input = None
        for sel in [
            'input[placeholder*="email" i]',
            'input[placeholder*="Email" i]',
            'input[type="email"]',
            'input[placeholder*="address" i]',
            'input:first-of-type',
        ]:
            el = await page.query_selector(sel)
            if el:
                email_input = el
                print(f"Found email input: {sel}", flush=True)
                break

        if not email_input:
            print("ERROR: No email input found", flush=True)
            await browser.close()
            return

        await email_input.fill('kontiasuu@gmail.com')
        print("EMAIL_TYPED", flush=True)

        # Click Get Code
        btn = await page.query_selector('button:has-text("Get Code")')
        if btn:
            await btn.click()
            print("CODE_SENT", flush=True)
        else:
            print("ERROR: Get Code button not found", flush=True)
            await browser.close()
            return

        await page.wait_for_timeout(2000)

        # Signal ready for code
        print("WAITING_CODE", flush=True)
        code = sys.stdin.readline().strip()
        print(f"GOT_CODE: {code}", flush=True)

        # Find code input
        code_input = None
        for sel in [
            'input[placeholder*="code" i]',
            'input[placeholder*="Code" i]',
            'input:nth-of-type(2)',
        ]:
            el = await page.query_selector(sel)
            if el:
                code_input = el
                print(f"Found code input: {sel}", flush=True)
                break

        if code_input:
            await code_input.fill(code)
            print("CODE_ENTERED", flush=True)
        else:
            print("ERROR: Code input not found", flush=True)
            await browser.close()
            return

        # Click Continue
        btn = await page.query_selector('button:has-text("Continue"):not([disabled])')
        if btn:
            await btn.click()
            print("CONTINUE_CLICKED", flush=True)
        else:
            print("ERROR: Continue button not found or disabled", flush=True)
            await browser.close()
            return

        # Wait for redirect
        await page.wait_for_timeout(8000)
        print(f"URL: {page.url}", flush=True)

        # Get cookies
        cookies = await context.cookies()
        dorahacks_cookies = [c for c in cookies if 'dorahacks' in c.get('domain', '')]
        print(f"COOKIES: {len(dorahacks_cookies)}", flush=True)

        # Save cookies
        cred_path = os.path.expanduser("~/.agent/credentials/dorahacks-cookies.json")
        with open(cred_path, "w") as f:
            json.dump(dorahacks_cookies, f, indent=2)
        print(f"SAVED: {cred_path}", flush=True)

        for c in dorahacks_cookies:
            print(f"  {c['name']}: {c['value'][:60]}", flush=True)

        if '/login' not in page.url:
            print("LOGIN_SUCCESS", flush=True)
        else:
            print("LOGIN_STILL_ON_LOGIN_PAGE", flush=True)
            # Dump page content for debug
            text = await page.inner_text('body')
            print(f"BODY: {text[:500]}", flush=True)

        await browser.close()

asyncio.run(main())
