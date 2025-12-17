# Quick Start: MeshMapper API Integration

## ✅ What You Need to Do

### Step 1: Add Your API Key to GitHub Secrets

1. Go to your repository on GitHub
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Name: `MESHMAPPER_API_KEY`
5. Value: Your actual API key (get this from the MeshMapper admin)
6. Click **Add secret**

### Step 2: Deploy

Push your changes to the `main` branch, and the GitHub Actions workflow will automatically:
- Inject your API key from the secret
- Deploy the site to GitHub Pages

**That's it!** 🎉

## ❌ What You Do NOT Need to Do

- ❌ **DO NOT** edit `wardrive.js` to add your API key
- ❌ **DO NOT** edit `config.template.js` 
- ❌ **DO NOT** create a `config.js` file manually (unless testing locally)
- ❌ **DO NOT** replace any placeholder values in the code

## 🤔 How It Works

1. You add `MESHMAPPER_API_KEY` as a GitHub Secret
2. When you push to `main`, the GitHub Actions workflow runs
3. The workflow creates `content/config.js` with your API key
4. The app loads the key from `config.js` automatically
5. Every ping is now automatically posted to the MeshMapper API

## 🔍 Verify It's Working

After deployment, open the browser console (F12) and look for:
- ✅ "Posting to MeshMapper API: {lat, lon, who, power}" 
- ✅ "Successfully posted to MeshMapper API"

If you see:
- ⚠️ "MeshMapper API key not configured" - The secret wasn't set correctly

## 📖 More Information

For detailed setup instructions and troubleshooting, see [SETUP.md](SETUP.md)
