import { Focusable, ServerAPI, ModalRoot, sleep } from "decky-frontend-lib";
import { useState, useEffect, VFC, useRef } from "react";
import GameDisplay from "./GameDisplay";
import { ContentResult, ContentType, ExecuteGetGameDetailsArgs, ExecuteInstallArgs, GameDetails, GameImages, LaunchOptions, MenuAction, ProgressUpdate, ScriptActions } from "../Types/Types";
import { gameIDFromAppID } from "../Utils/gameIDFromAppID";
import Logger from "../Utils/logger";
import { Loading } from "./Loading";
import { GameStateUpdate, executeAction } from "../Utils/executeAction";

const gameDetailsRootClass = 'game-details-modal-root';

interface GameDetailsItemProperties {
    serverAPI: ServerAPI;
    shortname: string;
    initActionSet: string;
    initAction: string;
    closeModal?: any;
    clearActiveGame: () => void;
}


export const GameDetailsItem: VFC<GameDetailsItemProperties> = ({
    serverAPI, shortname, closeModal, initActionSet,
    // @ts-ignore
    initAction,
    clearActiveGame
}) => {

    const logger = new Logger("GameDetailsItem");
    logger.log("GameDetailsItem startup");
    const [scriptActions, setScriptActions] = useState<MenuAction[]>([]);
    const [gameData, setGameData] = useState<ContentResult<ContentType>>({ Type: "Empty", Content: { Details: {} } });
    logger.log("GameDetailsItem gameData", gameData);
    const [steamClientID, setSteamClientID] = useState("");
    logger.log("GameDetailsItem steamClientID", steamClientID);
    const [installing, setInstalling] = useState(false);
    logger.log("GameDetailsItem installing", installing);

    const [progress, setProgress] = useState<ProgressUpdate>({
        Percentage: 0,
        Description: ""
    } as ProgressUpdate);
    logger.log("GameDetailsItem progress", progress);

    const installingRef = useRef(installing);
    logger.log("GameDetailsItem installingRef", installingRef);
    useEffect(() => {
        logger.log("GameDetailsItem installingRef.current = installing");
        installingRef.current = installing;
    }, [installing]);


    useEffect(() => {
        if (installing) {
            logger.log("GameDetailsItem updateProgress");
            updateProgress();
        }
    }, [installing]);
    //const [] = useState("Play Game");
    useEffect(() => {
        logger.log("GameDetailsItem onInit");
        onInit();
    }, []);

    const reloadData = async () => {
        setGameData({ Type: "Empty", Content: { Details: {} } });
        onInit();
    };
    const onInit = async () => {
        try {
            logger.debug("onInit starting");
            const res = await executeAction<ExecuteGetGameDetailsArgs, GameDetails>(serverAPI, initActionSet,
                "GetDetails",
                {
                    shortname: shortname,
                    inputData: ""
                });
            logger.debug("onInit data", res);

            logger.debug("onInit res", res);
            if (res == null) {
                logger.error("onInit res is null");
                return;
            }
            setGameData(res);
            if (res.Type === "GameDetails") {
              setSteamClientID((res.Content as GameDetails).SteamClientID);
            }
            logger.debug("onInit finished");
            const actionRes = await executeAction<ExecuteGetGameDetailsArgs, ScriptActions>(serverAPI, initActionSet,
                "GetGameScriptActions",
                {
                    shortname: shortname,
                    inputData: ""
                });
            logger.debug("onInit actionRes", actionRes);
            if (actionRes == null) {
                logger.error("onInit actionRes is null");
                return;
            }
            if (actionRes.Type === "ScriptSet") {
                const scriptActions = actionRes.Content as ScriptActions;
                logger.debug("onInit scriptActions", scriptActions);
                setScriptActions(scriptActions.Actions);
            }

        } catch (error) {
            logger.error(error);
        }
    };

    const updateProgress = async () => {
        while (installingRef.current) {
            logger.debug("updateProgress loop starting");
            try {
                logger.debug("updateProgress");

                executeAction<ExecuteGetGameDetailsArgs, ProgressUpdate>(serverAPI, initActionSet,
                    "GetProgress",
                    {
                        shortname: shortname,
                        inputData: ""
                    }).then((res) => {
                        if (res == null) {
                            logger.error("updateProgress res is null");
                            return;
                        }
                        const progressUpdate = res.Content ;
                        if (progressUpdate != null) {
                            logger.debug(progressUpdate);
                            setProgress(progressUpdate);
                            logger.debug(progressUpdate.Percentage);
                            if (progressUpdate.Percentage >= 100) {
                                setInstalling(false);
                                logger.debug("setInstalling(false)");
                                install();
                                return;
                            }
                        }
                    }).catch((e) => {
                        logger.error('Error in progress updater', e);
                    });
            } catch (e) {
                logger.error('Error in progress updater', e);
            }

            logger.debug("sleeping");
            await sleep(1000);
            logger.debug("woke up");
        }
    };

    useEffect(() => {
        onInit();
    }, []);

    useEffect(() => {
        if (installing) {
            updateProgress(); // start the loop when installing is true
        }
    }, [installing]);
    const uninstall = async () => {
        try {
            await executeAction<ExecuteGetGameDetailsArgs, ContentType>(serverAPI, initActionSet,
                "Uninstall",
                {
                    shortname: shortname,
                    inputData: ""
                });
            await SteamClient.Apps.RemoveShortcut(parseInt(steamClientID));
            setSteamClientID("");
        } catch (error) {
            logger.error(error);
        }
    };
    const download = async () => {
        try {

            const result = await executeAction<ExecuteGetGameDetailsArgs, ContentType>(serverAPI, initActionSet,
                "Download",
                {
                    shortname: shortname,
                    inputData: ""
                });
            if (result?.Type == "Progress") {
              setInstalling(true);
            }
        } catch (error) {
            logger.error(error);
        }
    };
    const update = async () => {
        try {

            const result = await executeAction<ExecuteGetGameDetailsArgs, ContentType>(serverAPI, initActionSet,
                "Update",
                {
                    shortname: shortname,
                    inputData: ""
                });
            if (result?.Type == "Progress") {
              setInstalling(true);
            }

        } catch (error) {
            logger.error(error);
        }
    };
    const runScript = async (actionSet: string, actionId: string, args: any) => {
        const { unregister } = SteamClient.GameSessions.RegisterForAppLifetimeNotifications((data: GameStateUpdate) => {
            logger.log("runscript game state update: ", data);
            if (data.bRunning) {
                // This might not work in desktop mode.
                // @ts-ignore
                // let gamepadWindowInstance = SteamUIStore.m_WindowStore.GamepadUIMainWindowInstance
                // if (gamepadWindowInstance) {
                //     closeModal();
                setTimeout(async () => {

                    unregister();


                }, 1000);
                // }
            }
        });
        const result = await executeAction<ExecuteGetGameDetailsArgs, ContentType>(serverAPI, actionSet, actionId, args);

        if (result?.Type == "Progress") {
          setInstalling(true);
        }

    };
    const cancelInstall = async () => {
        try {
            setInstalling(false);
            await executeAction(serverAPI, initActionSet,
                "CancelInstall",
                {
                    shortname: shortname,
                    inputData: ""
                });

        } catch (error) {
            logger.error(error);
        }
    };
    const runner = async () => {

        setTimeout(async () => {
            let id = parseInt(steamClientID);
            let gid = gameIDFromAppID(id);
            const { unregister } = SteamClient.GameSessions.RegisterForAppLifetimeNotifications((data: GameStateUpdate) => {
                logger.log("data: ", data);
                if (!data.bRunning) {
                    // This might not work in desktop mode.
                    // @ts-ignore
                    let gamepadWindowInstance = SteamUIStore.m_WindowStore.GamepadUIMainWindowInstance;
                    if (gamepadWindowInstance) {
                        setTimeout(async () => {
                            gamepadWindowInstance.NavigateBack();
                            unregister();


                        }, 1000);
                    }
                }
            });

            await SteamClient.Apps.RunGame(gid, "", -1, 100);
            closeModal();
        }, 500);
    };
    const checkid = async () => {
        let id = parseInt(steamClientID);
        logger.debug("checkid", id);
        // @ts-ignore
        const apps = appStore.allApps.filter(app => app.appid == id);
        if (apps.length == 0) {
          return await getSteamId();
        } else {
          return id;
        }
    };

    const resetLaunchOptions = async () => {

        let id = await checkid();
        logger.debug("resetLaunchOptions id:", id);
        configureShortcut(id);

    };
    const configureShortcut = async (id: Number) => {
        setSteamClientID(id.toString());
        const result = await executeAction<ExecuteInstallArgs, ContentType>(serverAPI, initActionSet,
            "Install",
            {
                shortname: shortname,
                steamClientID: id.toString(),
                inputData: ""
            });
        const name = (gameData.Content as GameDetails).Name;
        // @ts-ignore
        const apps = appStore.allApps.filter(app => app.display_name == name && app.app_type == 1073741824 && app.appid != id);
        for (const app of apps) {
            logger.debug("removing shortcut", app.appid);
            await SteamClient.Apps.RemoveShortcut(app.appid);
        }
        await cleanupIds();


        if (result == null) {
            logger.error("install result is null");
            return;
        }
        if (result.Type === "LaunchOptions") {
            const launchOptions = result.Content as LaunchOptions;
            //await SteamClient.Apps.SetAppLaunchOptions(gid, "");
            await SteamClient.Apps.SetAppLaunchOptions(id, launchOptions.Options);
            await SteamClient.Apps.SetShortcutName(id, (gameData.Content as GameDetails).Name);
            await SteamClient.Apps.SetShortcutExe(id, launchOptions.Exe);
            await SteamClient.Apps.SetShortcutStartDir(id, launchOptions.WorkingDir);
            //@ts-ignore
            const defaultProton = settingsStore.settings.strCompatTool;
            if (launchOptions.Compatibility && launchOptions.Compatibility == true) {
                logger.debug("Setting compatibility", launchOptions.CompatToolName);
                if (defaultProton) {
                    await SteamClient.Apps.SpecifyCompatTool(id, defaultProton);
                }
            }
            else {
                logger.debug("Setting compatibility to empty string");
                await SteamClient.Apps.SpecifyCompatTool(id, "");
            }
            setInstalling(false);

        }
        const imageResult = await executeAction<ExecuteGetGameDetailsArgs, GameImages>(serverAPI, initActionSet,
            "GetJsonImages",
            {
                shortname: shortname,
                inputData: ""
            });
        if (imageResult == null) {
            logger.error("imageResult is null");
            return;
        }
        if (imageResult.Type == "Images") {
            const images = imageResult.Content as GameImages;
            logger.debug("images", images);
            if (images.Grid !== null) {
              SteamClient.Apps.SetCustomArtworkForApp(id, images.Grid, 'png', 0);
            }
            if (images.Hero !== null) {
              SteamClient.Apps.SetCustomArtworkForApp(id, images.Hero, "png", 1);
            }
            if (images.Logo !== null) {
              SteamClient.Apps.SetCustomArtworkForApp(id, images.Logo, "png", 2);
            }
            if (images.GridH !== null) {
              SteamClient.Apps.SetCustomArtworkForApp(id, images.GridH, "png", 3);
            }
        }

    };

    const cleanupIds = async () => {
        // @ts-ignore
        const apps = appStore.allApps.filter(app => (app.display_name == "bash" || app.display_name == "") && app.app_type == 1073741824);
        for (const app of apps) {
            await SteamClient.Apps.RemoveShortcut(app.appid);
        }
    };

    const getSteamId = async () => {

        const name = (gameData.Content as GameDetails).Name;
        // @ts-ignore
        const apps = appStore.allApps.filter(app => app.display_name == name && app.app_type == 1073741824);
        await cleanupIds();
        if (apps.length > 0) {
            const id = apps[0].appid;
            if (apps.length > 1) {
                for (let i = 1; i < apps.length; i++) {
                    await SteamClient.Apps.RemoveShortcut(apps[i].appid);
                }
            }
            return id;

        }
        else {
            const id = await SteamClient.Apps.AddShortcut("Name", "/bin/bash", "", "");
            await SteamClient.Apps.SetShortcutName(id, (gameData.Content as GameDetails).Name);
            return id;
        }
    };
    const install = async () => {
        //updateProgress();
        try {
            const id = await getSteamId();
            configureShortcut(id);

        } catch (error) {
            logger.error(error);
        }
    };
    return (
        <div className={gameDetailsRootClass}>
            <style>
                {`
                .${gameDetailsRootClass} .GenericConfirmDialog {
                    width: 100%;
                    height: 100%;
                    padding: 0;
                    border: 0;
                    border-radius: 0;
                    background: #0e172175;
                    backdrop-filter: blur(8px);
                }
                .${gameDetailsRootClass} .gamepaddialog_ModalPosition_30VHl {
                    padding: 0;
                }
                .footer_BasicFooter_3T1iF {
                    border-top: unset;
                }
            `}
            </style>
            <ModalRoot
                onCancel={() => {
                    //e.stopPropagation();
                    clearActiveGame();
                    closeModal();
                    // Router.CloseSideMenus();
                }}
            >
                <Focusable
                    style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
                    onCancelActionDescription="Go back to Store"
                >
                    {gameData.Type === "Empty" && <Loading />}
                    {gameData.Type === "GameDetails" &&
                        <GameDisplay
                            serverApi={serverAPI}
                            name={(gameData.Content as GameDetails).Name}
                            shortName={(gameData.Content as GameDetails).ShortName}
                            description={(gameData.Content as GameDetails).Description}
                            images={(gameData.Content as GameDetails).Images}
                            steamClientID={steamClientID}
                            closeModal={closeModal}
                            installing={installing}
                            installer={download}
                            progress={progress}
                            cancelInstall={cancelInstall}
                            uninstaller={uninstall}
                            editors={(gameData.Content as GameDetails).Editors}
                            initActionSet={initActionSet}
                            runner={runner}
                            actions={scriptActions}
                            resetLaunchOptions={resetLaunchOptions}
                            updater={update}
                            scriptRunner={runScript}
                            clearActiveGame={clearActiveGame}
                            reloadData={reloadData}
                        />
                    }
                </Focusable>
            </ModalRoot >
        </div>
    );
};
