import { Component, OnInit, Input } from '@angular/core';
import { Router, RouterModule, ActivatedRoute } from '@angular/router';

import { GamesListService, PlayerGameList } from '../games-list/games-list.service';
import { Game } from '../game/game.service';


declare var Plotly: any;

type SRUnknownReason = null | 'placement' | 'off-season' | 'unknown';

@Component({
    selector: 'games-graph',
    templateUrl: './games-graph.component.html',
    providers: [RouterModule]
})
export class GamesGraphComponent implements OnInit {
    gamesLists: Array<PlayerGameList>;

    constructor(public gamesListService: GamesListService,
                public router: Router,
                public activatedRoute: ActivatedRoute) { }

     ngOnInit(): void {
        this.activatedRoute.params.subscribe(
            params => {
                if (params.hasOwnProperty('share_key')){
                    this.fetchSharedGames(params['share_key']);
                } else {
                    this.fetchOwnGames();
                }
            }
        );
    }

	fetchSharedGames(share_key: string){
        this.gamesListService.fetchSharedGames(share_key,
            res => {
                this.gamesLists = res;
                if (this.gamesLists.length){
                    this.renderGraph(this.gamesLists);
                }
            },
            err => {
                console.error(err);
            }
        );
    }

    fetchOwnGames() {
        this.gamesListService.fetchGames(
            res => {
                this.gamesLists = res;
                if (this.gamesLists.length){
                    this.renderGraph(this.gamesLists);
                }
            },
            err => {
                console.error(err);
            }
        );
    }

    playerHref(playerGames: PlayerGameList){
        return 'player_' + playerGames.player.replace(/\W/g, '_');
    }

    formatDate(date: Date): string {
        return date.toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    }

    graphableGamesLists(gameLists: Array<PlayerGameList>){
        if (!gameLists){
            return 
        }
        return gameLists.filter(gameList => gameList.list.filter(game => game.endSR != null).length >= 2);
    }

    compareGamesChronologically(a: Game, b: Game): number {
        // We add other sort keys to get deterministic results even when
        // multiple games have the same startTime, which has previously
        // happened as a result of errors.
        return (+a.startTime - +b.startTime) || (a.duration - b.duration) || (a.key > b.key ? +1 : -1);
    }

    renderGraph(gameLists: PlayerGameList[]): void {
        // A looping list of colors to use for different accounts on the graph.
        // These must be rgba definitions ending in ', 1)' to allow opacity replacement below.
        const colors = [
            'rgba(255, 193, 0, 1)',
            'rgba(117, 96, 242, 1)',
            'rgba(194, 92, 78, 1)',
            'rgba(142, 194, 0, 1)',
            'rgba(0, 142, 194, 1)',
            'rgba(194, 0, 142, 1)'
        ];

        // The number of recent games to show initially.
        const initialGamesVisible = 100;

        // Data for each game, for each player.
        const unfilteredGames = gameLists.map(x => ({
            player: x.player,
            games: x.list.slice().map(data => {
                const placement = data.rank === 'placement';
                const offSeason = this.gamesListService.getSeason(Number(data.startTime) / 1000).toLowerCase().indexOf('off') > -1;
                const reason: SRUnknownReason = placement ? 'placement' : offSeason ? 'off-season' : 'unknown';
                return {
                    data: data,
                    date: data.startTime,
                    sr: data.endSR || null,
                    srWasUnknownReason: data.endSR ? null : reason
                }}).sort((a, b) => this.compareGamesChronologically(a.data, b.data))
        }));

        // Estimate SR when possible for games that are missing it.
        const gamesWithEstimates = unfilteredGames.map(x => ({
            player: x.player,
            games: this.fillUnknownSRs(x.games),
        }));

        // Filter out games without an SR (even estimated), and players with fewer than two eligible games.
        const graphableGames = gamesWithEstimates
            .map(x => ({
                player: x.player,
                games: x.games.filter(game => !!game.sr && !!game.date)
            })).filter(x => x.games.length > 2);

        // Indicies of all player arrays below, which will exclude filtered players.
        const playerIndicies = graphableGames.map((l, i) => i);

        // Player names.
        const playerNames = graphableGames.map(l => l.player);

        // Each game's x coordinate is its index when sorted by date with all other graphable games.
        const gamesWithXs = graphableGames.map(x => x.games.map(game => ({
            x: NaN,
            ...game
        })));

        type FullyAnnotatedGame = typeof gamesWithXs[0][0];

        // Graphable games from all players, flattened into a single sorted array.
        const allGames = gamesWithXs.reduce((a, b) => a.concat(b)).sort((a, b) => this.compareGamesChronologically(a.data, b.data));
        const allXs: number[] = [];
        let skips = 0;
        for (let i = 0; i < allGames.length; i++) {
            if (i > 0) {
                const dTHours = (+allGames[i].date - +allGames[i - 1].date) / (1000 * 60 * 60);
                skips += 4 * Math.max(Math.log(dTHours) / Math.log(10), 0);
            }
            allGames[i].x = i + skips;
            allXs.push(allGames[i].x);
        }

        // Find all unique dates from all games.
        let lastDateFormatted: string|null = null;
        const allDates = allGames.map(game => {
            const dateFormatted = this.formatDate(game.date);

            if (dateFormatted !== lastDateFormatted) {
                lastDateFormatted = dateFormatted;

                return {
                    date: game.date,
                    formatted: dateFormatted,
                    x: game.x
                }
            } else {
                return null;
            }
        }).filter(Boolean);

        // The game data, which will be populated below.
        const plotlyData = [] as {
            games: FullyAnnotatedGame[],
            x: number[],
            y: number[],
            name: string,
            showlegend: boolean,
            legendgroup: string|null,
            hoverinfo: string,
            line: {
                width: number,
                color: string,
            }
        }[];

        // Layout settings, and axes whose values may be populated below.
        const plotlyLayout = {
            title: '',
            font: {
                color: 'rgb(150, 150, 150)'
            },
            hovermode: 'closest',
            dragmode: 'pan',
            xaxis: {
                title: '',

                tickmode: 'array',
                ticktext: [] as string[],
                tickvals: [] as number[],

                ticks: '',
                showgrid: true,
                gridcolor: 'rgba(0, 0, 0, 0.15)',
                zeroline: false,
                fixedrange: false,
                range: [NaN, NaN] as [number, number]
            },
            yaxis: {
                fixedrange: true,
                range: [NaN, NaN] as [number, number],
                gridcolor: 'rgba(0, 0, 0, 1.0)',
                side: 'right',
                tickmode: 'array',
                ticktext: [500, 625, 750, 875, 1000, 1125, 1250, 1375, 1500, 1625, 1750, 1875, 2000, 2125, 2250, 2375, 2500, 2625, 2750, 2875, 3000, 3125, 3250, 3375, 3500, 3625, 3750, 3875, 4000, 4125, 4250, 4375, 4500, 4625, 4750, 4875, 5000].map((n, i) => i % 2 == 0 ? String(n) : ''),
                tickvals: [500, 625, 750, 875, 1000, 1125, 1250, 1375, 1500, 1625, 1750, 1875, 2000, 2125, 2250, 2375, 2500, 2625, 2750, 2875, 3000, 3125, 3250, 3375, 3500, 3625, 3750, 3875, 4000, 4125, 4250, 4375, 4500, 4625, 4750, 4875, 5000],
            },
            overlaying: false,
            margin: {
                l: 10,
                r: 40,
                b: 70,
                t: 5
            },
            showlegend: false,
            legend: {
                y: 100,
                x: 0,
                orientation: 'h'
            },
            plot_bgcolor: 'rgba(0, 0, 0, 0)',
            paper_bgcolor: 'rgba(0, 0, 0, 0)',
            shapes: [] as any[]
        };

        // Plotly settings.
        const plotlyConfig = {
            displayModeBar: false,
            staticPlot: false,
            doubleClick: false,
            showTips: false,
            showAxisDragHandles: false,
            showAxisRangeEntryBoxes: false,
            displaylogo: false,
            scrollZoom: true
        };

        // Generate dot and line serises for each player.
        const plotlyDataLines: any[] = [];
        const plotlyDataDots: any[] = [];
        const plotlyLayoutShapes: any[] = [];
        for (const playerIndex of playerIndicies) {
            const color = colors[playerIndex % colors.length];
            const translucent = color.replace(', 1)', ', 0.5)');

            const lineXs: number[] = [];
            const lineSRs: number[] = [];

            const dotXs: number[] = [];
            const dotSRs: number[] = [];
            const dotLabels: string[] = [];

            const shapes: any[] = [];

            const playerName = playerNames[playerIndex];
            const games = gamesWithXs[playerIndex];

            let lastGame: FullyAnnotatedGame = null;
            for (const game of games) {
                if (lastGame && (lastGame.x < game.x - 1)) {
                    // If we're not immediately following the last game,
                    // project its SR value forward to x - 1 so this game
                    // only takes the typical amount of x-space (1).
                    lineXs.push(game.x - 1);
                    lineSRs.push(lastGame.sr);
                }

                lineXs.push(game.x);
                lineSRs.push(game.sr);

                let labelPrefix = '';
                if (game.srWasUnknownReason) {
                    labelPrefix = `SR estimated (${game.srWasUnknownReason})<br>`;
                }
                dotXs.push(game.x);
                dotSRs.push(game.sr);
                dotLabels.push(`${labelPrefix}${game.data.result} - ${game.data.map}`);

                lastGame = game;
            }

            // Project SR line out beyond the end of the graph with latest value.
            lineSRs.push(lineSRs[lineSRs.length - 1]);
            lineXs.push(allXs[allXs.length - 1] + 1024);

            plotlyDataLines.push({
                showlegend: true,
                name: playerName,
                legendgroup: playerName,
                x: lineXs,
                y: lineSRs,
                overtrackGames: games,
                mode: 'lines',
                hoverinfo: 'skip',
                line: {
                    width: 2,
                    color: color,
                }
            });
            
            plotlyDataDots.push({
                showlegend: false,
                name: playerName,
                legendgroup: playerName,
                x: dotXs,
                y: dotSRs,
                overtrackGames: games,
                text: dotLabels,
                mode: 'markers',
                hoverinfo: 'y+text',
                marker: {
                    size: 6,
                    color: translucent
                }
            });

            let runOfUnknownSRGames: null | FullyAnnotatedGame[] = [];
            const outlineRun = () => {
                let minSR = 5000;
                let maxSR = 0;

                for (const game of runOfUnknownSRGames) {
                    if (game.sr < minSR) {
                        minSR = game.sr;
                    }
                    if (game.sr > maxSR) {
                        maxSR = game.sr;
                    }
                }

                for (const game of runOfUnknownSRGames) {
                    plotlyLayoutShapes.push({
                        type: 'rect',
                        xref: 'x',
                        yref: 'y',
                        x0: game.x - 0.5,
                        x1: game.x + 0.5,
                        y0: minSR - 25,
                        y1: maxSR + 25,
                        line: {
                            width: 0,
                            color: color,
                        },
                        layer: 'below',
                        fillcolor: {
                            'placement': 'rgba(0, 127, 255, 0.25)',
                            'off-season': 'rgba(255, 127, 0, 0.25)',
                        }[game.srWasUnknownReason] || 'rgba(255, 0, 0, 0.125)',
                    });
                }
            };
            for (const game of games) {
                if (game.srWasUnknownReason) {
                    if (runOfUnknownSRGames) {
                        runOfUnknownSRGames.push(game);
                    } else {
                        runOfUnknownSRGames = [game];
                    }
                } else {
                    if (runOfUnknownSRGames) {
                        outlineRun();
                        runOfUnknownSRGames = null;
                    }
                }
            }
            if (runOfUnknownSRGames) {
                outlineRun();
            }
        }

        // Add the lines and dot series to the Plotly data (arguments go top-to-bottom).
        plotlyData.unshift(...plotlyDataLines, ...plotlyDataDots);

        // Add the shapes/outlines to the Plotly layout.
        plotlyLayout.shapes.push(...plotlyLayoutShapes);

        // Show the legend only if there are multiple players.
        plotlyLayout.showlegend = playerIndicies.length > 1;

        // Define limits for panning/zooming.
        const minLeft = -2;
        const maxRight = allXs[allXs.length - 1] + 2;
        const maxRange = maxRight - minLeft;
        const minRange = 2;

        // Returns layout properties that need to be updated to reflect a target X range.
        const getLayout = (left: number, right: number, enabledTraces?: Array<string> | null): {
            'xaxis.range': [number, number],
            'yaxis.range': [number, number],
            'xaxis.ticktext': string[],
        } => {
            let range = right - left;

            if (range > maxRange) {
                const excess = range - maxRange;
                range = maxRange;
                left += excess / 2;
                right -= excess / 2;
            } else if (range < minRange) {
                const shortfall = minRange - range;
                range = minRange;
                left -= shortfall / 2;
                right += shortfall / 2;
            }

            if (left < minLeft) {
                left = minLeft;
                right = left + range;
            } else if (right > maxRight) {
                right = maxRight;
                left = right - range;
            }

            let minSR = 5000;
            let maxSR = 0;

            for (const game of allGames) {
                if (enabledTraces && enabledTraces.indexOf(game.data.player) == -1) {
                    continue;
                }

                if (game.x >= left && game.x <= right) {
                    if (game.sr < minSR) {
                        minSR = game.sr;
                    }
                    if (game.sr > maxSR) {
                        maxSR = game.sr;
                    }
                }
            }

            if (minSR >= maxSR) {
                minSR = 0;
                maxSR = 5000;
            }

            // Sample approximately 15 dates currently in-range and label them on the x-axis.
            const datesInRange = allDates.filter(d => d.x >= left && d.x <= right);
            const nInM = Math.max(1, Math.round(datesInRange.length / 15));
            const ticktext: string[] = [];
            let i = 0;
            for (const d of allDates) {
                if (d.x >= left && d.x <= right) {
                    if (i++ % nInM == 0) {
                        ticktext.push(d.formatted);
                        continue;
                    }
                }

                ticktext.push('');
            }

            const yPadding = 25;

            return {
                'xaxis.range': [left, right],
                'yaxis.range': [minSR - yPadding, maxSR + yPadding],
                'xaxis.ticktext': ticktext,
            }
        };

        // Set the initial range to include the last 100 games.
        const intitialLeft = allXs[Math.max(allXs.length - initialGamesVisible, 0)] - 0.5;
        const initialRight = allXs[allXs.length - 1] + 1;
        const initialLayout = getLayout(intitialLeft, initialRight, null);
        plotlyLayout.xaxis.range = initialLayout['xaxis.range'];
        plotlyLayout.yaxis.range = initialLayout['yaxis.range'];
        plotlyLayout.xaxis.ticktext = initialLayout['xaxis.ticktext'];
        plotlyLayout.xaxis.tickvals = allDates.map(d => d.x);
        // Find our target element and let TypeScript know about the properties Plotly will add.
        const plotlyElement = document.getElementById('sr-graph') as HTMLElement & {
            on: (eventName: string, callback: (eventData: {
                points?: {data: any, pointNumber: number}[],
                event?: MouseEvent,
                source?: string,
            }) => void) => void,
            data: any,
            layout: any
        };

        // Initial Plotly render and element initialization.
        Plotly.newPlot(plotlyElement, plotlyData, plotlyLayout, plotlyConfig);

        plotlyElement.on('plotly_click', eventData => {
            if (eventData.points.length != 1) return;
            if (!eventData.points[0].data.overtrackGames) return;
            const game: FullyAnnotatedGame = eventData.points[0].data.overtrackGames[eventData.points[0].pointNumber];
            if (!game.data.viewable) return;

            if (eventData.event.ctrlKey){
                window.open('./game/' + game.data.key);
            } else {
                this.router.navigate(['/game/' + game.data.key]);
            }
        });

        plotlyElement.on('plotly_hover', eventData => {
            if (eventData.points.length != 1) return;
            if (!eventData.points[0].data.overtrackGames) return;
            const game: FullyAnnotatedGame = eventData.points[0].data.overtrackGames[eventData.points[0].pointNumber];
            if (!game.data.viewable) return;

            plotlyElement.classList.add('point-hovered');
        });

        plotlyElement.on('plotly_unhover', eventData => {
            plotlyElement.classList.remove('point-hovered');
        });

        plotlyElement.on('plotly_relayout', eventData => {
            let eventSource = 'user';
            if (eventData.source){
                eventSource = eventData.source;
            }

            let left: number = eventData['xaxis.range[0]'];
            let right: number = eventData['xaxis.range[1]'];
            if (eventSource == 'user' && right != undefined && left != undefined){
                const enabledTraces: Array<string> = plotlyElement.data.filter(e => e.showlegend == false && e.visible != 'legendonly').map(e => e.name);

                Plotly.relayout(plotlyElement, {
                    source: 'constrainZoom',
                    ...getLayout(left, right, enabledTraces)
                });
            }
        });

        plotlyElement.on('plotly_restyle', eventData => {
            let left: number = plotlyElement.layout.xaxis.range[0];
            let right: number = plotlyElement.layout.xaxis.range[1];
            const enabledTraces: Array<string> = plotlyElement.data.filter(e => e.showlegend == false && e.visible != 'legendonly').map(e => e.name);

            Plotly.relayout(plotlyElement, {
                source: 'constrainZoom',
                ...getLayout(left, right, enabledTraces)
            });
        });

        plotlyElement.on('overtrack_set_range', eventData => {
            const enabledTraces: Array<string> = plotlyElement.data.filter(e => e.showlegend == false && e.visible != 'legendonly').map(e => e.name);
            
            let games = allGames;

            const getGameSeason = (game: FullyAnnotatedGame) => this.gamesListService.getSeason(+game.date / 1000);

            if (eventData['season'] == 'current') {
                const latestSeason = getGameSeason(games[games.length - 1]);
                games = games.filter(game => getGameSeason(game) == latestSeason);
            }

            if (eventData['last']) {
                games = games.slice(-eventData['last']);
            }

            const left = games[0].x - 0.5;
            const right = games[games.length - 1].x + 0.5;

            Plotly.relayout(plotlyElement, {
                source: 'constrainZoom',
                ...getLayout(left, right, enabledTraces)
            });
        });
    }

    userSetRange(opts = {}) {
        (document.getElementById('sr-graph') as any).emit('overtrack_set_range', opts);
    }
    
    // Attaches an estimated SR to games with unknown SR, where possible.
    fillUnknownSRs<T extends {data: Game, sr: number}>(games: T[]): T[] {
        // Create our copies of each game item, to be filled below.
        const filled = games.map(game => (Object.assign({}, game)));

        const drawOrOffSeason = (g: Game) => {
            return g.result === 'DRAW' || this.gamesListService.getSeason((+g.startTime) / 1000).toLowerCase().indexOf('off') > -1;
        }

        const srPerMatch = 25;
        const delta = (r: Game, winCoefficient: number = 1.0, lossCoefficient: number = 1.0) => {
            if (drawOrOffSeason(r)) {
                return 0;
            }else if (r.result == 'WIN') {
                return +srPerMatch * winCoefficient;
            } else if (r.result == 'LOSS') {
                return -srPerMatch * lossCoefficient;
            } else {
                return NaN;
            }
        }

        // If we have a startSR and a result, use that to predict the end SR.
        for (const entry of filled) {
            if (!entry.sr) {
                if (entry.data.startSR) {
                    const result = entry.data.startSR + delta(entry.data);
                    if (!isNaN(result)) {
                        entry.sr = result;
                    }
                }
            }
        }

        // If the next game has a startSR, use that for the current end SR.
        let previous: T = null;
        for (const entry of filled) {
            if (previous && !previous.sr) {
                if (entry.data.startSR) {
                    previous.sr = entry.data.startSR;
                }
            }

            previous = entry;
        }

        const unknownSegments: {
            // the anchoring start and end SRs, if known.
            start: number|null, // the SR *before/excluding* the first game
            end: number|null, // the SR *after/including* the last game
            games: T[][], // multiple games together are ties, merged for this
        }[] = [];

        let lastEntry: T = null;
        let currentSegment: typeof unknownSegments[0] = null;

        for (const entry of filled) {
            if (currentSegment) {
                if (entry.sr) {
                    // end the current segment
                    currentSegment.end = entry.data.startSR || entry.sr - (delta(entry.data) || 0);
                    currentSegment = null;
                } else {
                    // continue current segment
                    if (drawOrOffSeason(entry.data)) {
                        // group with previous game
                        currentSegment.games[currentSegment.games.length - 1].push(entry);
                    } else {
                        // append on its own
                        currentSegment.games.push([entry]);
                    }
                }
            } else {
                if (entry.sr) {
                    // carry on between segments
                } else {
                    // start new segment
                    currentSegment = {
                        start: lastEntry && lastEntry.sr || null,
                        end: null,
                        games: [[entry]]
                    }
                    unknownSegments.push(currentSegment);
                }
            }
            lastEntry = entry;
        }

        for (const unknown of unknownSegments) {
            if (unknown.games.length == 0) {
                // shouldn't happen.
                continue;
            }

            if (!unknown.start && !unknown.end) {
                // We have nothing to anchor an estimate at, so these remain unknown.
                continue;
            }

            // The amount we predict these games will change the SR.
            let naturalTotalDelta = 0;
            let wins = 0;
            let losses = 0;
            let draws = 0;
            let others = 0;
            for (const entry of unknown.games) {
                const result = entry[0].data.result;
                naturalTotalDelta += delta(entry[0].data) || 0;
                if (drawOrOffSeason(entry[0].data)) { draws++; }
                else if (result === 'WIN') { wins++; }
                else if (result === 'LOSS') { losses++; }
                else others++;
            }

            if (!unknown.start || !unknown.end) {
                // only one end is anchored, so we can just extrapolate without scaling.
                if (!unknown.start) unknown.start = unknown.end - naturalTotalDelta;
                if (!unknown.end) unknown.end = unknown.start + naturalTotalDelta;

                let sr = unknown.start;
                for (const games of unknown.games) {
                    sr += delta(games[0].data) || 0;
                    for (const game of games) {
                        game.sr = Math.round(sr);
                    }
                }

                continue;
            }

            // both ends are anchored, so we need to hit this target delta.
            const knownDelta = unknown.end - unknown.start;

            if (wins > 0 && losses > 0) {
                // scale either wins or losses to be worth more in order to hit target.
                let winCoefficient = 1.0;
                let lossCoefficient = 1.0;
                const lossesNaturalValue = - losses * srPerMatch;
                const shortfall = knownDelta - naturalTotalDelta;
                if (shortfall > 0) {
                    winCoefficient += shortfall / wins / srPerMatch;
                } else if (shortfall < 0) {
                    lossCoefficient += -shortfall / losses / srPerMatch;
                }

                let sr = unknown.start;
                for (const games of unknown.games) {
                    sr += delta(games[0].data, winCoefficient, lossCoefficient) || 0;
                    for (const game of games) {
                        game.sr = Math.round(sr);
                    }
                }

                continue;
            }

            // just put them in line from start to end, except for draws.
            let sr = unknown.start;
            for (const games of unknown.games) {
                if (!drawOrOffSeason(games[0].data)) {
                    sr += knownDelta / (unknown.games.length - draws);
                }
                for (const game of games) {
                    game.sr = Math.round(sr);
                }
            }
        }

        return filled;
    }
}
