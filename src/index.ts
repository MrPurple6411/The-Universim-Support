/**
 * The Universim Support - Vortex support for The Universim
 * Copyright (C) 2023 Tobey Blaber
 * 
 * This program is free software; you can redistribute it and/or modify it
 * under the terms of the GNU General Public License as published by the
 * Free Software Foundation; either version 3 of the License, or (at your
 * option) any later version.
 * 
 * This program is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY
 * or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License
 * for more details.
 * 
 * You should have received a copy of the GNU General Public License along with
 * this program; if not, see <https://www.gnu.org/licenses>.
 */
import '@total-typescript/ts-reset';
import { join } from 'path';
import { version } from '../package.json';
import { BEPINEX_MOD_PATH, validateBepInEx } from './bepinex';
import { migrateVersion, parseChangelog, validateChangelog } from './changelog';
import { EXTENSION_ID, GAME_EXE, GAME_NAME, UNITY_PLAYER } from './constants';
import { getDiscovery, getModPath, getMods } from './utils';
import registerInstallerBepInEx from './installers/bepinex';
import registerInstallerBepInExMixed from './installers/bepinex-mixed';
import registerInstallerBepInExPatcher from './installers/bepinex-patcher';
import registerInstallerBepInExPlugin from './installers/bepinex-plugin';
import registerModTypeBepInEx5 from './mod-types/bepinex-5';
import registerModTypeBepInEx6 from './mod-types/bepinex-6';
import registerModTypeBepInExMixed from './mod-types/bepinex-mixed';
import registerModTypeBepInExPatcher from './mod-types/bepinex-patcher';
import registerModTypeBepInExPlugin from './mod-types/bepinex-plugin';
import { NEXUS_GAME_ID } from './platforms/nexus';
import { STEAM_GAME_ID } from './platforms/steam';
import { getFileVersion, getProductVersion } from 'exe-version';
import { major, prerelease } from 'semver';
import store2 from 'store2';
import { actions, fs, selectors, types, util } from 'vortex-api';
import { z } from 'zod';
import ensureDirWritableAsync = fs.ensureDirWritableAsync;
import profileById = selectors.profileById;
import IDiscoveryResult = types.IDiscoveryResult;
import IExtensionApi = types.IExtensionApi;
import IExtensionContext = types.IExtensionContext;
import IGame = types.IGame;

export const store = store2.namespace(EXTENSION_ID).namespace(`v${major(version, true)}`);
store.isFake(prerelease(version, true)?.[0].toString() === 'dev');

export default function main(context: IExtensionContext): boolean {
    if (store.isFake()) {
        debugSetup(context);
    }

    context.registerMigration(migrateVersion);

    // register The Universim with Vortex
    context.registerGame({
        id: NEXUS_GAME_ID,
        name: GAME_NAME,
        logo: 'gameart.jpg',
        mergeMods: true,
        queryModPath: getModPath,
        executable: () => GAME_EXE,
        requiredFiles: [GAME_EXE],
        environment: { SteamAPPId: STEAM_GAME_ID },
        details: {
            steamAppId: +STEAM_GAME_ID
        },
        requiresLauncher,
        queryArgs: {
            steam: [{ id: STEAM_GAME_ID }]
        },
        setup: (discovery) => setup(context.api, discovery),
        getGameVersion: async (gamePath) => {
            const versionParser = z.string().min(0);
            const exePath = join(gamePath, GAME_EXE);
            try {
                return versionParser.parse((await getProductVersion(exePath)).trim());
            } catch {
                const playerPath = join(gamePath, UNITY_PLAYER);
                try {
                    return versionParser.parse((await getProductVersion(playerPath)).trim());
                } catch {
                    try {
                        return versionParser.parse((await getFileVersion(exePath)).trim());
                    } catch {
                        try {
                            return versionParser.parse((await getFileVersion(playerPath)).trim());
                        } catch {
                            return 'Unknown';
                        }
                    }
                }
            }
        }
    });

    context.once(async () => {
        context.api.events.on('gamemode-activated', async (gameMode: string) => {
            if (gameMode !== NEXUS_GAME_ID) {
                return;
            }

            await gamemodeActivated(context.api);
        });

        context.api.onAsync('did-deploy', async (profileId: string) => {
            if (profileById(context.api.getState(), profileId)?.gameId !== NEXUS_GAME_ID) {
                return;
            }

            await didDeploy(context.api);
        });
    });



    registerModTypeBepInEx5(context);
    registerModTypeBepInEx6(context);
    registerModTypeBepInExPlugin(context);
    registerModTypeBepInExPatcher(context);
    registerModTypeBepInExMixed(context);

    registerInstallerBepInEx(context);
    registerInstallerBepInExPlugin(context);
    registerInstallerBepInExPatcher(context);
    registerInstallerBepInExMixed(context);

    return true;
}

const debugSetup = (context: IExtensionContext) => {
    Object.assign(globalThis, {
        toebean: {
            sbz: {
                context,
                getState: () => context.api.getState(),
                getDiscovery: () => getDiscovery(context.api.getState()),
                getMods: () => getMods(context.api.getState()),
                'vortex-api': {
                    actions,
                    selectors,
                    types,
                    util,
                },
                parseChangelog,
            },
        }
    });
}

/**
 * Ensures the mod directories exists and are writable
 * @param api 
 * @param discovery 
 */
const setup = async (api: IExtensionApi, discovery: IDiscoveryResult | undefined = getDiscovery(api.getState())) => {
    if (discovery?.path) {
        await Promise.all([BEPINEX_MOD_PATH].map(path => ensureDirWritableAsync(join(discovery.path!, path))));
    }
}

const requiresLauncher: Required<IGame>['requiresLauncher'] = async (_, store) => {
    switch (store) {
        case 'steam':
        default:
            return { launcher: 'steam', addInfo: STEAM_GAME_ID };
    }
}

const gamemodeActivated = async (api: IExtensionApi) => {
    await Promise.all([validateBepInEx(api)]);
    await validateChangelog(api);
}

const didDeploy = async (api: IExtensionApi) =>
    await Promise.all([validateBepInEx(api)]);
