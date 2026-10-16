---
title: Move from AnyList
description: Copy your AnyList grocery list, other lists, pantry and recipes into Waffled with one command.
---

If your family keeps groceries and recipes in [AnyList](https://www.anylist.com), an admin can
copy all of it into Waffled in one go. It's a one-way copy: nothing in AnyList changes, and once
it's done Waffled doesn't talk to AnyList again (apart from its public list of common grocery
items, which powers [suggestions as you type](/features/lists/)).

## What comes across

| In AnyList | In Waffled |
|---|---|
| Your grocery list | Items on the [grocery board](/features/lists/), with quantities, notes and aisles |
| Every other list | A custom list each, in the same order, with sections |
| Crossed-off items | History: kept for suggestions and **Recently crossed off**, but not on the live list |
| Your Pantry list and the Pantry section of your grocery list | [Pantry](/features/pantry/) items (the Pantry module is switched on for you) |
| Recipes | [Recipes](/features/meals/) with ingredients (and their headings), steps, times, servings, source, notes, rating, collection and photo |

AnyList's aisles map onto Waffled's where they match (Produce, Dairy, Meat, Bakery, Frozen);
the rest keep their AnyList name, such as Snacks or Household. "Other" is left for
Waffled to file by name.

Items in your grocery list's Pantry section go into Waffled's Pantry, even if AnyList has no
separate Pantry list. This includes categories that Waffled maps to Pantry, such as Soups &
Canned Goods, Cooking & Baking, and Condiments & Dressings. They are not added to the shopping list.

Meal-plan entries aren't copied.

## Run it

On a Docker install, from the folder with `./waffled`:

```bash
# See what would be copied — nothing is written
./waffled admin import-anylist --email you@example.com --password 'your-anylist-password' --dry-run

# Copy it
./waffled admin import-anylist --email you@example.com --password 'your-anylist-password'
```

It prints the lists it picked and how many lists, items, pantry items and recipes it added.
You can also pass the sign-in as `ANYLIST_EMAIL` and `ANYLIST_PASSWORD` environment variables.
The password is used once to read your account and isn't stored.

### Options

- `--grocery "<list name>"` — which AnyList list is your grocery list. By default it's the
  list with "grocery" or "shopping" in its name.
- `--pantry "<list name>"` — which list is your pantry. By default it's the one named like
  "Pantry"; if there isn't one, no pantry items are imported.
- `--household <id>` — needed only when the server has more than one household
  (`./waffled admin list-households` shows the ids).

## Running it again

It's safe to run more than once. Each AnyList item and recipe is remembered after it's copied,
so a second run only adds what's new — handy if the family keeps using AnyList for a few days
while everyone switches over. Edits made in AnyList to things already copied aren't brought
across.

If an earlier import put Pantry-section items on the shopping list, run the import again.
It copies those items into Pantry and removes their old shopping entries without adding duplicates.

## Good to know

- **Recipe photos** are downloaded and stored with your other Waffled photos. If one can't be
  downloaded, the recipe is still imported and the command tells you how many photos were
  missing.
- **Who added what** isn't known to AnyList's export, so imported items show no "added by".
- In development, run `pnpm run anylist:import --dry-run` from `apps/api` instead.
