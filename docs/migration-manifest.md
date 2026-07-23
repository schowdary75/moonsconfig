# MooNsConfig migration manifest

Generated from the final client, server operation registry, compatibility handlers, and Prisma schema.

| Inventory                       |                   Disposition |
| ------------------------------- | ----------------------------: |
| Browser route modules           |                49/49 migrated |
| Legacy server operations        |              329/329 migrated |
| Compatibility endpoint patterns |                56/56 migrated |
| Legacy database tables          |                124/124 mapped |
| Prisma models                   | 127 (124 legacy + 3 additive) |

Every operation's method, canonical path, service, repository, authorization boundary, transaction boundary, compatibility behavior, and test is recorded in `migration-manifest.json`.
