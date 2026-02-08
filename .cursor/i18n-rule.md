* All translation keys must be **full English sentences**
* In `english.json`, keys and values must be identical
  Example:

  ```json
  {
    "Select your main language for the app": "Select your main language for the app"
  }
  ```
* This is intentional to make adding new languages easier
* i18next is configured with `keySeparator: false` — periods in keys are fine (flat JSON)
