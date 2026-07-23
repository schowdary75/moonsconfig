# Third-party notices

Original MooNsConfig source code is licensed under the [MIT License](LICENSE), copyright 2026
MooNsConfig.

This repository also contains, downloads, or connects to third-party software, data, media, fonts,
services, and container images. Those materials remain under their respective licenses and terms;
the MooNsConfig MIT License does not relicense them. This notice is provided for clarity and does
not replace an upstream license file or service agreement.

## Map and geographic data

### Natural Earth

The administrative-boundary files in `client/public/admin1/`, the India boundary data in
`client/src/data/indiaClaim.json`, and geographic data distributed through `world-atlas` are
derived from [Natural Earth](https://www.naturalearthdata.com/). Natural Earth publishes its raster
and vector map data in the public domain. Although attribution is not required, the project
gratefully uses the suggested credit:

> Made with Natural Earth.

Map data is provided without a warranty of accuracy. Geographic boundaries and names do not imply
an endorsement or position by MooNsConfig or any upstream data provider.

### world-atlas

The client imports `world-atlas` 2.x, which redistributes Natural Earth data as TopoJSON and is
published under the ISC License:

> Copyright 2013-2019 Michael Bostock
>
> Permission to use, copy, modify, and/or distribute this software for any purpose with or without
> fee is hereby granted, provided that the above copyright notice and this permission notice appear
> in all copies.
>
> THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS
> SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE
> AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
> WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT,
> NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE
> OF THIS SOFTWARE.

### OpenStreetMap and map services

Route-map features can use OpenStreetMap data through Nominatim, the public Project OSRM routing
endpoint, and CARTO-hosted map tiles. OpenStreetMap data is available under the Open Data Commons
Open Database License (ODbL), and uses of that data must credit OpenStreetMap and its contributors.
The interactive tile map includes the attribution `© OpenStreetMap contributors © CARTO`.

When exporting, printing, or redistributing a map that contains OpenStreetMap-derived data, preserve
the attribution and make the ODbL availability clear. Public Nominatim and OSRM endpoints are not
controlled by this project and provide no project-controlled service level; operators must follow
their usage policies and decide whether a hosted or self-hosted replacement is appropriate.

- [OpenStreetMap copyright and attribution](https://www.openstreetmap.org/copyright)
- [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/)
- [Project OSRM](https://project-osrm.org/)
- [CARTO](https://carto.com/)

## Browser-downloaded libraries and assets

Some standalone browser tools load versioned libraries from cdnjs or jsDelivr at runtime. They are
not covered by the MooNsConfig MIT License.

| Component                                                                  | Version  | Upstream license                                 |
| -------------------------------------------------------------------------- | -------- | ------------------------------------------------ |
| [Leaflet](https://github.com/Leaflet/Leaflet/blob/v1.9.4/LICENSE)          | 1.9.4    | BSD-2-Clause                                     |
| [Font Awesome Free](https://fontawesome.com/license/free)                  | 6.5.1    | CC-BY-4.0 AND OFL-1.1 AND MIT                    |
| [html2canvas](https://github.com/niklasvh/html2canvas/blob/v1.4.1/LICENSE) | 1.4.1    | MIT                                              |
| [searoute-ts](https://github.com/mayurrawte/searoute-ts)                   | 2.2.0    | MIT                                              |
| [gifenc](https://github.com/mattdesl/gifenc)                               | 1.0.3    | MIT                                              |
| [webm-muxer](https://github.com/Vanilagy/webm-muxer)                       | 5.0.3    | MIT                                              |
| [Google Fonts](https://developers.google.com/fonts)                        | Per font | The open-source license identified for each font |

Refer to each package's upstream distribution for its complete license text. Deployed environments
should pin, self-host, or otherwise govern remote browser dependencies according to their security
and availability requirements.

MooNsConfig also references images hosted by [Unsplash](https://unsplash.com/license) and animated
media hosted by [GIPHY](https://giphy.com/terms). Those assets are fetched from the providers at
runtime, are not owned by MooNsConfig, and remain subject to the provider and creator terms.
Downstream operators are responsible for confirming that externally hosted media remains suitable
for their intended use.

## JavaScript dependencies

The root, client, and server `package.json` files list direct npm dependencies, and
`package-lock.json` records the resolved dependency graph. Every dependency retains its own
copyright and license. After installation, the authoritative notices are available in the
dependency package directories, commonly as `LICENSE`, `LICENSE.md`, `COPYING`, or `NOTICE` files
under `node_modules/`.

Distributors of compiled or packaged builds should include every notice required by the dependency
versions they ship. Do not infer a dependency's license from the MooNsConfig MIT identifier.

## Runtime containers

The one-command launcher downloads Node.js-based application images and the official MySQL 8.4,
Redis 7.4, and Nginx container images. Those images and the software inside them are downloaded
separately and remain under their upstream terms:

- [Node.js Docker image](https://hub.docker.com/_/node)
- [MySQL Docker image](https://hub.docker.com/_/mysql)
- [Redis Docker image](https://hub.docker.com/_/redis)
- [Nginx Docker image](https://hub.docker.com/_/nginx)

## Maintaining this notice

When adding or upgrading a dependency, dataset, font, hosted image, CDN script, API, or container
image:

1. Review the upstream license and service terms.
2. Preserve required copyright, license, and attribution text.
3. Update this file when a bundled or user-visible third-party component changes.
4. Keep credentials and private provider agreements out of the repository.

If an upstream license conflicts with this summary, the upstream license controls.
