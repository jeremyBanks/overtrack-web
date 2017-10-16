import { Injectable } from '@angular/core';
import { Http, Response } from '@angular/http';

import { Observable } from 'rxjs/Observable';
import 'rxjs/add/operator/map';

import { User } from '../login/user-login.service';
import { Game } from '../game/game.service';

@Injectable()
export class GamesListService {
    private gamesListUrl = 'https://api.overtrack.gg/games';
    private games:Array<PlayerGameList> = null;
    private sharedGames: Map<string, Array<PlayerGameList>> = new Map<string, Array<PlayerGameList>>();

    constructor (private http: Http) {}

    getGamesList(): Observable<Response> {
        return this.http.get(this.gamesListUrl, { withCredentials: true});
    }

    getSharedGamesList(share_key: string): Observable<Response> {
        return this.http.get(this.gamesListUrl + '/' + share_key);
    }

    toGamesList(res: Response) {
        let list: Array<PlayerGameList> = [];
        let map: { [id: string]: Array<Game>} = {};
        
        let body = res.json();

        let num = 1;

        for (let game of body.games) {
            let gamelist: Array<Game> = [];

            let playerName = game.player_name;
            if (game.custom_game || playerName.indexOf('(Custom Games)') != -1){
                playerName = 'Custom Games';
            }
            
            if (map[playerName]) {
                gamelist = map[playerName];
            } else {
                map[playerName] = gamelist;
                list.push({
                    player: playerName,
                    user_id: game.user_id,
                    list: gamelist
                });
            }

            if (game.duration){
                let heroes: Array<GamesListHero> = [];
                for (let hero of game.heroes_played) {
                    if (hero[1] > 0.15){
                        heroes.push({
                            name: hero[0],
                            percentagePlayed: hero[1]
                        });
                    }
                }



                let blueScore: number = null;
                let redScore: number = null;
                if (game.score){
                    blueScore = game.score[0];
                    redScore = game.score[1];
                }
                
                gamelist.push({
                    num: num++,
                    error: false,
                    map: game.map,
                    result: game.result == 'UNKNOWN' ? 'UNKN' : game.result,
                    // srChange: srChange,
                    // srString: srString,
                    endSR: game.end_sr,
                    startTime: new Date(game.time * 1000),
                    startSR: game.start_sr,
                    player: game.player_name,
                    blueScore: blueScore,
                    redScore: redScore,
                    duration: game.duration,
                    url: game.url,
                    key: game.key,
                    heroes: heroes,
                    rank: game.rank,
                    customGame: game.custom_game,
                    season: this.getSeason(game.time),
                    viewable: game.viewable,

                    userID: game.user_id,
                    mapType: null,
                    owner: game.player_name,
                    stages: null,
                    killfeed: null,
                    endTime: null,
                    tabStatistics: null,
                    heroStatistics: null,
                    startSREditable: true,
                    endSREditable: true,
                    teams: null,
                    placement: false,
                    rankEditable: false,
                    groupSize: null,

                    deleted: false
                });
            } else {
                gamelist.push({
                    num: num++,
                    error: true,
                    map: null,
                    result: 'ERROR',
                    endSR: null,
                    startTime: new Date(game.time * 1000),
                    startSR: null,
                    player: game.player_name,
                    blueScore: null,
                    redScore: null,
                    duration: null,
                    url: null,
                    key: game.key,
                    heroes: null,
                    rank: null,
                    customGame: false,
                    season: this.getSeason(game.time),
                    viewable: true,

                    userID: game.user_id,
                    mapType: null,
                    owner: game.player_name,
                    stages: null,
                    killfeed: null,
                    endTime: null,
                    tabStatistics: null,
                    heroStatistics: null,
                    startSREditable: true,
                    endSREditable: true,
                    teams: null,
                    placement: false,
                    rankEditable: false,
                    groupSize: null,

                    deleted: false
                });
            }
        }
        return list;
    }

    fetchSharedGames(share_key: string, games: (value: Array<PlayerGameList>) => void, error: (error: any) => void){
        if (this.sharedGames.get(share_key) != null){
            games(this.sharedGames.get(share_key));
        } else {
            this.getSharedGamesList(share_key).subscribe(
                next => {
                    let fetchedGames = this.toGamesList(next);
                    this.addHardCodedGames(share_key, fetchedGames);
                    this.sharedGames.set(share_key, fetchedGames);
                    games(fetchedGames);
                },
                err => {
                    error(err);
                }
            );
        }
    }

    protected addHardCodedGames(shareKey: string, fetchedGames: PlayerGameList[]) {
        const WIN = 'WIN', LOSS = 'LOSS', DRAW = 'DRAW', UNKN = 'UNKN';
        const W = WIN, L = LOSS, T = DRAW;
        const JAN = 1, FEB = 2, MAR = 3, APR = 4, MAY = 5, JUN = 6, JUL = 7, AUG = 8, SEP = 9, OCT = 10, NOV = 11, DEC = 12;
        const PLACEMENT = null;

        let n = 0;
        const game = (sr: number|null, year: number, month: number, day: number, result: 'WIN' | 'LOSS' | 'DRAW' | 'UNKN' = 'UNKN', heroes: string[] = null):Game => {
            n++;
            const d = new Date(year, month - 1, day, 12, n);
            return {
                startTime: d,
                endTime: d,
                endSR: sr,
                result: result,

                viewable: false,

                placement: sr === PLACEMENT,
                groupSize: undefined,
                startSREditable: false,
                endSREditable: false,
                deleted: false,
                startSR: undefined,
                num: undefined,
                error: undefined,
                url: undefined,
                heroes: undefined,
                rank: !sr ? 'placement' : undefined,
                season: undefined,
                userID: undefined,
                map: UNKN, 
                mapType: undefined,
                redScore: undefined,
                blueScore: undefined,
                player: undefined,
                key: undefined,
                owner: undefined,
                stages: undefined,
                killfeed: undefined,
                duration: undefined,
                tabStatistics: undefined,
                heroStatistics: undefined,
                teams: undefined,
                customGame: undefined,
                rankEditable: undefined,
            }
        };

        if (shareKey.toLowerCase() === 'magic') {
            for (const {player, list, user_id} of fetchedGames) {
                if (player.toUpperCase() === 'MAGIC') {
                    list.unshift(...[
                        game(2340, 2016, 6, 28, UNKN),
                        game(2295, 2016, 6, 29, UNKN),
                        game(2070, 2016, 8, 18, UNKN),
                        game(0, 2016, 8, 31, ),
                        game(2402, 2016, 9, 1, UNKN),
                        game(1965, 2016, 10, 16, UNKN),
                        game(1847, 2016, 10, 22, UNKN),
                        game(1867, 2016, 10, 22, W),
                        game(1841, 2016, 10, 26, UNKN),
                        game(1735, 2016, 10, 28, L),
                        game(1761, 2016, 10, 29, W),
                        game(1738, 2016, 10, 29, L),
                        game(1738, 2016, 10, 29, T),
                        game(1879, 2016, 11, 24, UNKN),
                        game(0, 2016, 11, 30, ),
                        game(1600, 2016, 12, 1, UNKN),
                        game(1953, 2016, 12, 15, UNKN),
                        game(1761, 2017, 2, 22, UNKN),
                        game(0, 2017, 2, 28, ),
                        game(PLACEMENT, 2017, 3, 1, W),
                        game(PLACEMENT, 2017, 3, 1, L),
                        game(PLACEMENT, 2017, 3, 1, W),
                        game(PLACEMENT, 2017, 3, 1, W),
                        game(PLACEMENT, 2017, 3, 1, W),
                        game(PLACEMENT, 2017, 3, 1, L),
                        game(PLACEMENT, 2017, 3, 1, W),
                        game(PLACEMENT, 2017, 3, 1, L),
                        game(PLACEMENT, 2017, 3, 1, W),
                        game(1215, 2017, 3, 1, W),
                        game(1500, 2017, 3, 5, UNKN),
                        game(1600, 2017, 3, 15, UNKN),
                        game(1511, 2017, 4, 7, UNKN),
                        game(1513, 2017, 4, 8, UNKN),
                        game(1298, 2017, 4, 12, UNKN),
                        game(1279, 2017, 4, 12, UNKN),
                        game(1273, 2017, 4, 16, UNKN),
                        game(1378, 2017, 4, 16, UNKN),
                        game(1285, 2017, 4, 21, UNKN),
                        game(1310, 2017, 4, 21, UNKN),
                        game(1331, 2017, 4, 22, UNKN),
                        game(1366, 2017, 4, 22, W),
                        game(1349, 2017, 4, 22, UNKN),
                        game(1334, 2017, 4, 22, UNKN),
                        game(1451, 2017, 4, 29, UNKN),
                        game(1557, 2017, 4, 30, UNKN),
                        game(1765, 2017, 5, 4, UNKN),
                        game(1849, 2017, 5, 9, UNKN),
                        game(1873, 2017, 5, 9, W),
                        game(1898, 2017, 5, 9, W),
                        game(1898, 2017, 5, 9, T),
                        game(1930, 2017, 5, 9, W),
                        game(1961, 2017, 5, 9, W),
                        game(1935, 2017, 5, 9, L),
                        game(1950, 2017, 5, 9, W),
                        game(1927, 2017, 5, 9, L),
                        game(1927, 2017, 5, 9, T),
                        game(1902, 2017, 5, 9, L),
                        game(1918, 2017, 5, 9, W),
                        game(1897, 2017, 5, 10, L),
                        game(1874, 2017, 5, 10, L),
                        game(1855, 2017, 5, 10, L),
                        game(1873, 2017, 5, 10, W),
                        game(1895, 2017, 5, 10, W),
                        game(1895, 2017, 5, 11, T),
                        game(1872, 2017, 5, 11, L),
                        game(1849, 2017, 5, 12, L),
                        game(1870, 2017, 5, 12, W),
                        game(1870, 2017, 5, 12, T),
                        game(1891, 2017, 5, 12, W),
                        game(1916, 2017, 5, 12, W),
                        game(1945, 2017, 5, 12, W),
                        game(1981, 2017, 5, 12, W),
                        game(2018, 2017, 5, 12, W),
                        game(1999, 2017, 5, 12, L),
                        game(2012, 2017, 5, 12, W),
                        game(2035, 2017, 5, 12, W),
                        game(2060, 2017, 5, 12, W),
                        game(2089, 2017, 5, 12, W),
                        game(2065, 2017, 5, 12, L),
                        game(2041, 2017, 5, 13, L),
                        game(2062, 2017, 5, 13, W),
                        game(2062, 2017, 5, 13, T),
                        game(2087, 2017, 5, 13, W),
                        game(2064, 2017, 5, 13, L),
                        game(2035, 2017, 5, 13, L),
                        game(2058, 2017, 5, 13, W),
                        game(2090, 2017, 5, 13, W),
                        game(2121, 2017, 5, 13, W),
                        game(2102, 2017, 5, 13, L),
                        game(2121, 2017, 5, 13, W),
                        game(2148, 2017, 5, 13, W),
                        game(2172, 2017, 5, 13, W),
                        game(2151, 2017, 5, 13, L),
                        game(2174, 2017, 5, 13, W),
                        game(2154, 2017, 5, 13, L),
                        game(2131, 2017, 5, 13, L),
                        game(2103, 2017, 5, 14, L),
                        game(2069, 2017, 5, 14, L),
                        game(2087, 2017, 5, 14, W),
                        game(2110, 2017, 5, 14, W),
                        game(2085, 2017, 5, 14, L),
                        game(2108, 2017, 5, 15, W),
                        game(2126, 2017, 5, 15, W),
                        game(2148, 2017, 5, 15, W),
                        game(2176, 2017, 5, 15, W),
                        game(2202, 2017, 5, 15, W),
                        game(2182, 2017, 5, 15, L),
                        game(2206, 2017, 5, 15, W),
                        game(2233, 2017, 5, 15, W),
                        game(2210, 2017, 5, 15, L),
                        game(2235, 2017, 5, 15, W),
                        game(2212, 2017, 5, 15, L),
                        game(2190, 2017, 5, 15, L),
                        game(2164, 2017, 5, 16, L),
                        game(2164, 2017, 5, 16, T),
                        game(2133, 2017, 5, 16, L),
                        game(2150, 2017, 5, 16, W),
                        game(2127, 2017, 5, 16, L),
                        game(2145, 2017, 5, 16, W),
                        game(2165, 2017, 5, 16, W),
                        game(2133, 2017, 5, 17, L),
                        game(2107, 2017, 5, 17, L),
                        game(2128, 2017, 5, 17, W),
                        game(2152, 2017, 5, 17, W),
                        game(2176, 2017, 5, 18, W),
                        game(2153, 2017, 5, 18, L),
                        game(2131, 2017, 5, 19, L),
                        game(2148, 2017, 5, 19, W),
                        game(2123, 2017, 5, 19, L),
                        game(2143, 2017, 5, 19, W),
                        game(2123, 2017, 5, 19, L),
                        game(2138, 2017, 5, 20, W),
                        game(2157, 2017, 5, 20, W),
                        game(2182, 2017, 5, 20, W),
                        game(2163, 2017, 5, 20, L),
                        game(2182, 2017, 5, 20, W),
                        game(2199, 2017, 5, 20, W),
                        game(2177, 2017, 5, 20, L),
                        game(2200, 2017, 5, 20, W),
                        game(2223, 2017, 5, 20, W),
                        game(2201, 2017, 5, 20, L),
                        game(2220, 2017, 5, 21, W),
                        game(2239, 2017, 5, 21, W),
                        game(2266, 2017, 5, 21, W),
                        game(2240, 2017, 5, 21, L),
                        game(2264, 2017, 5, 21, W),
                        game(2283, 2017, 5, 21, W),
                        game(2260, 2017, 5, 21, L),
                        game(2278, 2017, 5, 21, W),
                        game(2304, 2017, 5, 21, W),
                        game(2282, 2017, 5, 21, L),
                        game(2250, 2017, 5, 21, L),
                        game(0, 2017, 5, 30, ),
                        game(PLACEMENT, 2017, 6, 5, W),
                        game(PLACEMENT, 2017, 6, 5, L),
                        game(PLACEMENT, 2017, 6, 5, W),
                        game(PLACEMENT, 2017, 6, 5, W),
                        game(PLACEMENT, 2017, 6, 5, W),
                        game(PLACEMENT, 2017, 6, 5, L),
                        game(PLACEMENT, 2017, 6, 5, W),
                        game(PLACEMENT, 2017, 6, 5, W),
                        game(PLACEMENT, 2017, 6, 5, L),
                        game(2169, 2017, 6, 5, L),
                        game(2150, 2017, 6, 9, L),
                        game(2193, 2017, 6, 9, W),
                        game(2232, 2017, 6, 9, W),
                        game(2272, 2017, 6, 9, W),
                        game(2253, 2017, 6, 14, L),
                        game(2238, 2017, 6, 14, L),
                        game(2276, 2017, 6, 14, W),
                        game(2311, 2017, 6, 14, W),
                        game(2292, 2017, 6, 15, L),
                        game(2322, 2017, 6, 15, W),
                        game(2358, 2017, 6, 15, W),
                        game(2390, 2017, 6, 15, W),
                        game(2367, 2017, 6, 15, L),
                        game(2399, 2017, 6, 19, W),
                        game(2434, 2017, 6, 19, W),
                        game(2413, 2017, 6, 25, L),
                        game(2443, 2017, 6, 25, W),
                        game(2469, 2017, 7, 5, W),
                        game(2493, 2017, 7, 5, W),
                        game(2470, 2017, 7, 5, L),
                        game(2495, 2017, 7, 5, W),
                        game(2472, 2017, 7, 5, L),
                        game(2450, 2017, 7, 5, L),
                        game(2425, 2017, 7, 9, L),
                        game(2402, 2017, 7, 9, L),
                        game(2382, 2017, 7, 9, L),
                        game(2360, 2017, 7, 9, L),
                        game(2338, 2017, 7, 9, L),
                        game(2338, 2017, 7, 9, T),
                    ].reverse());
                } else if (player.toUpperCase() === 'MIGHT') {
                    list.unshift(...[
                        game(PLACEMENT, 2017, 5, 26, L),
                        game(PLACEMENT, 2017, 5, 26, W),
                        game(PLACEMENT, 2017, 5, 26, L),
                        game(PLACEMENT, 2017, 5, 26, W),
                        game(PLACEMENT, 2017, 5, 26, L),
                        game(PLACEMENT, 2017, 5, 26, W),
                        game(PLACEMENT, 2017, 5, 26, L),
                        game(PLACEMENT, 2017, 5, 26, W),
                        game(PLACEMENT, 2017, 5, 26, W),
                        game(2207, 2017, 5, 26, L),
                        game(2306, 2017, 5, 26, W),
                        game(2362, 2017, 5, 26, W),
                        game(2314, 2017, 5, 26, L),
                        game(2286, 2017, 5, 26, L),
                        game(2342, 2017, 5, 26, W),
                        game(2400, 2017, 5, 26, W),
                        game(2452, 2017, 5, 26, W),
                        game(2492, 2017, 5, 26, W),
                        game(2538, 2017, 5, 26, W),
                        game(2510, 2017, 5, 27, L),
                        game(2480, 2017, 5, 27, L),
                        game(2515, 2017, 5, 27, W),
                        game(2550, 2017, 5, 27, W),
                        game(0, 2017, 5, 30, ),
                        game(PLACEMENT, 2017, 6, 3, W),
                        game(PLACEMENT, 2017, 6, 3, L),
                        game(PLACEMENT, 2017, 6, 3, L),
                        game(PLACEMENT, 2017, 6, 3, L),
                        game(PLACEMENT, 2017, 6, 3, L),
                        game(PLACEMENT, 2017, 6, 3, L),
                        game(PLACEMENT, 2017, 6, 3, L),
                        game(PLACEMENT, 2017, 6, 3, W),
                        game(PLACEMENT, 2017, 6, 3, W),
                        game(2303, 2017, 6, 3, L),
                        game(2286, 2017, 6, 9, L),
                        game(2264, 2017, 6, 9, L),
                        game(2250, 2017, 6, 10, L),
                        game(2236, 2017, 6, 10, L),
                        game(2217, 2017, 6, 10, L),
                        game(2198, 2017, 6, 11, L),
                        game(2234, 2017, 6, 11, W),
                        game(2215, 2017, 6, 12, L),
                        game(2257, 2017, 6, 12, W),
                        game(2296, 2017, 6, 12, W),
                        game(2273, 2017, 6, 14, L),
                        game(2309, 2017, 6, 14, W),
                        game(2290, 2017, 6, 15, L),
                        game(2322, 2017, 6, 15, W),
                        game(2304, 2017, 6, 15, L),
                        game(2328, 2017, 6, 15, W),
                        game(2357, 2017, 6, 15, W),
                        game(2376, 2017, 6, 16, W),
                        game(2404, 2017, 6, 16, W),
                        game(2382, 2017, 6, 16, L),
                        game(2365, 2017, 6, 19, L),
                        game(2343, 2017, 6, 19, L),
                        game(2343, 2017, 6, 21, T),
                        game(2369, 2017, 6, 21, W),
                        game(2394, 2017, 6, 21, W),
                        game(2369, 2017, 6, 21, L),
                        game(2397, 2017, 6, 21, W),
                        game(2376, 2017, 6, 22, L),
                        game(2404, 2017, 6, 22, W),
                        game(2427, 2017, 6, 22, W),
                        game(2399, 2017, 6, 22, L),
                        game(2378, 2017, 6, 23, L),
                        game(2402, 2017, 6, 23, W),
                        game(2434, 2017, 6, 24, W),
                        game(2460, 2017, 6, 25, W),
                        game(2437, 2017, 6, 28, L),
                        game(2415, 2017, 6, 28, L),
                        game(2392, 2017, 6, 28, L),
                        game(2368, 2017, 7, 2, L),
                        game(2345, 2017, 7, 4, L),
                        game(2366, 2017, 7, 4, W),
                        game(2341, 2017, 7, 4, L),
                        game(2365, 2017, 7, 4, W),
                        game(2365, 2017, 7, 4, T),
                        game(2390, 2017, 7, 4, W),
                        game(2371, 2017, 7, 5, L),
                        game(2348, 2017, 7, 5, L),
                        game(2325, 2017, 7, 5, L),
                        game(2305, 2017, 7, 5, L),
                        game(2336, 2017, 7, 5, W),
                        game(2314, 2017, 7, 6, L),
                        game(2335, 2017, 7, 6, W),
                        game(2357, 2017, 7, 6, W),
                        game(2336, 2017, 7, 6, L),
                        game(2363, 2017, 7, 6, W),
                        game(2363, 2017, 7, 7, T),
                        game(2339, 2017, 7, 7, L),
                        game(2357, 2017, 7, 7, W),
                        game(2332, 2017, 7, 7, L),
                        game(2354, 2017, 7, 7, W),
                        game(2373, 2017, 7, 9, W),
                        game(2394, 2017, 7, 10, W),
                        game(2374, 2017, 7, 10, L),
                        game(2351, 2017, 7, 11, L),
                        game(2374, 2017, 7, 11, W),
                        game(2394, 2017, 7, 11, W),
                        game(2370, 2017, 7, 11, L),
                    ].reverse());
                } else if (player.toUpperCase() === 'MAGGY') {
                    list.unshift(...[
                        game(PLACEMENT, 2017, 5, 31, W),
                        game(PLACEMENT, 2017, 5, 31, W),
                        game(PLACEMENT, 2017, 5, 31, W),
                        game(PLACEMENT, 2017, 5, 31, W),
                        game(PLACEMENT, 2017, 5, 31, L),
                        game(PLACEMENT, 2017, 5, 31, L),
                        game(PLACEMENT, 2017, 5, 31, L),
                        game(PLACEMENT, 2017, 5, 31, L),
                        game(PLACEMENT, 2017, 5, 31, L),
                        game(2046, 2017, 5, 31, L),
                        game(1996, 2017, 6, 8, L),
                        game(2054, 2017, 6, 8, W),
                        game(2054, 2017, 6, 8, T),
                        game(2117, 2017, 6, 8, W),
                        game(2163, 2017, 6, 9, W),
                        game(2220, 2017, 6, 9, W),
                        game(2188, 2017, 6, 9, L),
                        game(2225, 2017, 6, 9, W),
                        game(2267, 2017, 6, 9, W),
                        game(2237, 2017, 6, 12, L),
                        game(2268, 2017, 6, 12, W),
                        game(2248, 2017, 6, 12, L),
                        game(2224, 2017, 6, 12, L),
                        game(2204, 2017, 6, 12, L),
                        game(2185, 2017, 6, 12, L),
                        game(2210, 2017, 6, 12, W),
                        game(2189, 2017, 6, 12, L),
                        game(2169, 2017, 6, 12, L),
                        game(2196, 2017, 6, 12, W),
                        game(2176, 2017, 6, 12, L),
                        game(2153, 2017, 6, 12, L),
                        game(2134, 2017, 6, 13, L),
                        game(2164, 2017, 6, 13, W),
                        game(2192, 2017, 6, 13, W),
                        game(2169, 2017, 6, 13, L),
                        game(2151, 2017, 6, 13, L),
                        game(2179, 2017, 6, 14, W),
                        game(2198, 2017, 6, 14, W),
                        game(2223, 2017, 6, 14, W),
                        game(2250, 2017, 6, 14, W),
                        game(2271, 2017, 6, 14, W),
                        game(2296, 2017, 6, 14, W),
                        game(2316, 2017, 6, 14, W),
                        game(2340, 2017, 6, 15, W),
                        game(2313, 2017, 6, 15, L),
                        game(2287, 2017, 6, 16, L),
                        game(2310, 2017, 6, 16, W),
                        game(2337, 2017, 6, 16, W),
                        game(2364, 2017, 6, 16, W),
                        game(2385, 2017, 6, 16, W),
                        game(2363, 2017, 6, 16, L),
                        game(2384, 2017, 6, 16, W),
                        game(2361, 2017, 6, 16, L),
                        game(2340, 2017, 6, 17, L),
                        game(2314, 2017, 6, 17, L),
                        game(2337, 2017, 6, 17, W),
                        game(2312, 2017, 6, 17, L),
                        game(2310, 2017, 6, 17, L),
                        game(2287, 2017, 6, 17, L),
                        game(2312, 2017, 6, 17, W),
                        game(2290, 2017, 6, 18, L),
                        game(2267, 2017, 6, 18, L),
                        game(2289, 2017, 6, 18, W),
                        game(2268, 2017, 6, 18, L),
                        game(2246, 2017, 6, 18, L),
                        game(2220, 2017, 6, 18, L),
                        game(2245, 2017, 6, 18, W),
                        game(2221, 2017, 6, 18, L),
                        game(2199, 2017, 6, 18, L),
                        game(2220, 2017, 6, 18, W),
                        game(2242, 2017, 6, 18, W),
                        game(2222, 2017, 6, 18, L),
                        game(2244, 2017, 6, 18, W),
                        game(2266, 2017, 6, 19, W),
                        game(2245, 2017, 6, 19, L),
                        game(2269, 2017, 6, 19, W),
                        game(2244, 2017, 6, 19, L),
                        game(2272, 2017, 6, 19, W),
                        game(2300, 2017, 6, 20, W),
                        game(2275, 2017, 6, 20, L),
                        game(2251, 2017, 6, 20, L),
                        game(2272, 2017, 6, 21, W),
                        game(2295, 2017, 6, 22, W),
                        game(2318, 2017, 6, 22, W),
                        game(2293, 2017, 6, 23, L),
                        game(2273, 2017, 6, 23, L),
                        game(2251, 2017, 6, 23, L),
                        game(2276, 2017, 6, 23, W),
                        game(2244, 2017, 6, 23, L),
                        game(2221, 2017, 6, 23, L),
                        game(2240, 2017, 6, 23, W),
                        game(2217, 2017, 6, 23, L),
                        game(2241, 2017, 6, 23, W),
                        game(2216, 2017, 6, 23, L),
                        game(2242, 2017, 6, 24, W),
                        game(2267, 2017, 6, 24, W),
                        game(2290, 2017, 6, 24, W),
                        game(2313, 2017, 6, 24, W),
                        game(2292, 2017, 6, 24, L),
                        game(2312, 2017, 6, 24, W),
                        game(2340, 2017, 6, 24, W),
                        game(2340, 2017, 6, 24, T),
                        game(2367, 2017, 6, 25, W),
                        game(2394, 2017, 6, 25, W),
                        game(2418, 2017, 6, 25, W),
                        game(2391, 2017, 6, 25, L),
                        game(2365, 2017, 6, 26, L),
                        game(2343, 2017, 6, 26, L),
                        game(2320, 2017, 6, 26, L),
                        game(2342, 2017, 6, 28, W),
                        game(2368, 2017, 7, 2, W),
                        game(2343, 2017, 7, 4, L),
                        game(2320, 2017, 7, 4, L),
                        game(2343, 2017, 7, 4, W),
                        game(2321, 2017, 7, 4, L),
                        game(2342, 2017, 7, 5, W),
                        game(2322, 2017, 7, 5, L),
                        game(2344, 2017, 7, 5, W),
                        game(2371, 2017, 7, 5, W),
                        game(2353, 2017, 7, 7, L),
                        game(2375, 2017, 7, 7, W),
                        game(2354, 2017, 7, 7, L),
                        game(2373, 2017, 7, 7, W),
                        game(2394, 2017, 7, 11, W),
                        game(2374, 2017, 7, 11, L),
                        game(2348, 2017, 7, 11, L),
                        game(2320, 2017, 7, 12, L),
                    ].reverse());
                } else if (player.toUpperCase() === 'MAGOO') {
                    list.unshift(...[
                        game(PLACEMENT, 2017, JUN, 11, WIN),
                        game(PLACEMENT, 2017, JUN, 11, WIN),
                        game(PLACEMENT, 2017, JUN, 11, WIN),
                        game(PLACEMENT, 2017, JUN, 11, LOSS),
                        game(PLACEMENT, 2017, JUN, 11, LOSS),
                        game(PLACEMENT, 2017, JUN, 11, LOSS),
                        game(PLACEMENT, 2017, JUN, 11, WIN),
                        game(PLACEMENT, 2017, JUN, 11, WIN),
                        game(PLACEMENT, 2017, JUN, 11, WIN),
                        game(2546, 2017, JUN, 11, WIN),
                        game(2623, 2017, JUN, 19, WIN),
                        game(2681, 2017, JUN, 25, WIN),
                        game(2636, 2017, JUN, 28, LOSS),
                        game(2697, 2017, JUN, 28, WIN),
                    ].reverse());
                }

                list.sort((a, b) => +b.startTime - +a.startTime);
            }
        }
    }

    fetchGames(games: (value: Array<PlayerGameList>) => void, error: (error: any) => void){
        if (this.games != null){
            games(this.games);
        } else {
            this.getGamesList().subscribe(
                next => {
                    this.games = this.toGamesList(next);
                    games(this.games);
                },
                err => {
                    console.error(err);
                }
            );
        }
    }

    getSeason(time: number) {
        if (time < +new Date(2016, 6 - 1, 28) / 1000) {
            return 'Pre-Season';
        } else if (time < +new Date(2016, 8 - 1, 17 + 2) / 1000) {
            return 'Season 1';
        } else if (time < +new Date(2016, 9 - 1, 2 - 2) / 1000) {
            return 'Off-Season 1-2'
        } else if (time < +new Date(2016, 11 - 1, 24 + 2) / 1000) {
            return 'Season 2'
        } else if (time < +new Date(2016, 12 - 1, 1 - 2) / 1000) {
            return 'Off-Season 2-3'
        } else if (time < +new Date(2017, 2 - 1, 22 + 2) / 1000) {
            return 'Season 3'
        } else if (time < 1488193200) { // 28 Feb 2017
            return 'Off-Season 3-4';
        } else if (time < 1496059200) { // 28 May 
            return 'Season 4';
        } else if (time < 1496275199 - 60 * 60 * 24 * 2) { // 1 June 2017
            return 'Off-Season 4-5';
        } else if (time < 1503964799) { // 29 August 2017
            return 'Season 5';
        } else if (time < 1504224000) {
            return 'Off-Season 5-6';
        } else {
            return 'Season 6'
        }
    }

}

export class PlayerGameList {
    player: string;
    user_id: number;
    list: Array<Game>;
}

// // TODO: Move out into own files
// export class GamesListEntry {
//     num: number;
//     error: boolean;
//     map: string;
//     result: string;
//     srChange: string;
//     srString: string;
//     startSR: number;
//     time: Date;
//     sr: number;
//     player: string;
//     blueScore: number;
//     redScore: number;
//     duration: number;
//     heroes: Array<GamesListHero>;
//     url: string;
//     key: string;
//     rank: string;
//     customGame: boolean;
//     season: string;
//     viewable: boolean;
// }

export class GamesListHero {
    name: string;
    percentagePlayed: number;
}

