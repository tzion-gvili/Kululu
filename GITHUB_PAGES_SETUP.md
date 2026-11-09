# העלאה ל-GitHub ופתיחה בטלפון

## 1. יצירת ה-repo

1. נכנסים ל-https://github.com/new (מחוברים כ-`tzion-gvili`)
2. Repository name: `Kululu`
3. Public
4. **לא** מסמנים README, .gitignore או license
5. Create repository

## 2. העלאת הקבצים

בדף ה-repo החדש לוחצים **uploading an existing file**, גוררים את כל הקבצים מ-`C:\Coffeebar\Kululu` (אין תיקיות – הכל באותו מקום), ולוחצים **Commit changes**.

## 3. הפעלת GitHub Pages

1. Settings → Pages
2. Source: **Deploy from a branch**
3. Branch: `main`, Folder: `/ (root)` → Save
4. אחרי דקה-שתיים האתר זמין בכתובת:

```
https://tzion-gvili.github.io/Kululu/
```

## 4. הוספת חתונה של זוג

1. נכנסים לאתר עם תעודת הזהות של הזוג → "פותחים חתונה" → ממלאים.
2. הגדרות → **⬇️ הורדת קובץ**.
3. ב-GitHub, בדף הראשי של ה-repo: Add file → Upload files → מעלים את הקובץ (`w-....json`) → Commit.
4. מעכשיו הזוג רואה את הרשימה מכל טלפון.

עדכון רשימה: מורידים קובץ חדש ומעלים אותו שוב (אותו שם – הוא מחליף את הישן).

## עדכון האפליקציה

מעלים שוב את הקבצים ששונו. אם הטלפון מציג גרסה ישנה – מרעננים, או מעלים את מספר הגרסה (`?v=`) ב-`index.html`.

## הוספת פרסומת

עורכים את `adv.json`. לכל פרסומת: `icon` (אימוג'י), `caption` (כותרת), `catchPhrase` (משפט), `phone`.
