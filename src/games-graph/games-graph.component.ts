import { Component, OnInit, Input } from '@angular/core';
import { Router, RouterModule, ActivatedRoute } from '@angular/router';

import { GamesListService, PlayerGameList } from '../games-list/games-list.service';
import { Game } from '../game/game.service';

import { HTML } from '../util/html';


declare var Plotly: any;

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
        var days = ['Sun','Mon','Tues','Wed','Thurs','Fri','Sat'];
        return days[date.getDay()] + ' ' + date.toLocaleDateString(undefined, {
            year: '2-digit',
            month: 'numeric',
            day: 'numeric'

        });
    }

    formatLabel(game: Game) {
        return (!game.endSR ? "[UNKNOWN SR, ESTIMATED]<br>" : "") + game.result + ' - ' + game.map;
    }

    graphableGamesLists(gameLists: Array<PlayerGameList>){
        if (!gameLists){
            return 
        }
        return gameLists.filter(gameList => gameList.list.filter(game => game.endSR != null).length >= 2);
    }

    // Attaches an estimated SR to each game.
    fillUnknownSRs(games: Game[]): { game: Game, sr: number }[] {
        const srPerMatch = 25;
        const g = games[0];
        const delta = (r: typeof g.result) => {
            if (r == 'WIN') {
                return +srPerMatch;
            } else if (r == 'LOSS') {
                return -srPerMatch
            } else if (r == 'DRAW') {
                return 0;
            } else {
                return NaN;
            }
        }

        const filled = games.map(game => ({game: game, sr: game.endSR || null}));

        // If we have a startSR and a result, use that to predict the end SR.
        for (const entry of filled) {
            if (!entry.sr) {
                if (entry.game.startSR) {
                    const result = entry.game.startSR + delta(entry.game.result);
                    if (!isNaN(result)) {
                        entry.sr = result;
                    }
                }
            }
        }

        // If the next game has a startSR, use that for the current end SR.
        let previous: typeof filled[0] = null;
        for (const entry of filled) {
            if (previous && !previous.sr) {
                if (entry.game.startSR) {
                    previous.sr = entry.game.startSR;
                }
            }

            previous = entry;
        }

        const unknownSegments: {
            // the anchoring start and end SRs, if known.
            start: number|null,
            end: number|null,
            games: (typeof filled)[], // multiple games together are ties, merged for this
        }[] = [];

        let lastEntry: typeof filled[0] = null;
        let currentSegment: typeof unknownSegments[0] = null;

        for (const entry of filled) {
            if (currentSegment) {
                if (entry.sr) {
                    // end the current segment
                    currentSegment.end = entry.game.startSR || entry.sr - (delta(entry.game.result) || 0);
                    currentSegment = null;
                } else {
                    // continue current segment
                    if (entry.game.result == 'DRAW') {
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
            let naturalTotalDelta = 0;
            for (const entry of unknown.games) {
                naturalTotalDelta += delta(entry[0].game.result) || 0;
            }

            let totalDelta = naturalTotalDelta;
            let fakeDeltaEach = 0;
            if (unknown.start && unknown.end) {
                totalDelta = unknown.end - unknown.start;
                fakeDeltaEach = (totalDelta - naturalTotalDelta) / (unknown.games.length + 1);
            }

            if (!unknown.start) {
                if (unknown.end) {
                    unknown.start = unknown.end - totalDelta;
                } else {
                    // we have absolutely no idea what SR this player is at, so let's put them at the average:
                    unknown.start = 2225;
                }
            }

            let sr = unknown.start;
            for (const entry of unknown.games) {
                sr += (delta(entry[0].game.result) || 0) + fakeDeltaEach;
                for (const e of entry) {
                    e.sr = Math.floor(sr);
                }
            }
        }

        return filled;
    }

    renderGraph(gameLists: PlayerGameList[]): void {
        const players = gameLists.map(l => l.player);

        type GraphableGame = {
            game: Game,
            playerIndex: number,
            connectedToNext: boolean,
            sr: number
        };

        // All graphable games and their continuity in a single flattened sorted list.
        const graphable: GraphableGame[] = [];

        for (const gamesList of gameLists) {
            let lastEntry: GraphableGame = null;
            const playerIndex = players.indexOf(gamesList.player);
            for (const {game, sr} of this.fillUnknownSRs(Array.from(gamesList.list).reverse())) {
                const entry = {
                    sr: sr,
                    game: game,
                    playerIndex: playerIndex,
                    connectedToNext: false
                };

                if (sr) {
                    graphable.push(entry);

                    // We're connected if the previous game has an end SR and
                    // the current game's start SR matches that end SR or is unknown.
                    if (game.endSR && lastEntry && lastEntry.game.endSR && (game.startSR == null || game.startSR == lastEntry.game.endSR)) {
                        lastEntry.connectedToNext = true;
                    }
                }

                lastEntry = entry;
            }
        }

        graphable.sort((a, b) => +a.game.startTime - +b.game.startTime);

        // The data for the lines and dots for each account's games.
        const playerLineXs: number[][] = players.map(_ => []);
        const playerLineSRs: number[][] = players.map(_ => []);

        const allXs: Array<number> = [];
        const playerDotXs: number[][] = players.map(_ => []);
        const playerDotSRs: number[][] = players.map(_ => []);
        const playerDotLabels: string[][] = players.map(_ => []);
        const playerDotGames: Game[][] = players.map(_ => []);

        // The last-graphed entry for each account.
        const playerLastEntries: GraphableGame[] = players.map(_ => null);

        // A looping list of colors to use for different accounts on the graph.
        const colors = [
            'rgba(255, 193, 0, 1)',
            'rgba(117, 96, 242, 1)',
            'rgba(194, 92, 78, 1)',
            'rgba(142, 194, 0, 1)',
            'rgba(0, 142, 194, 1)',
            'rgba(194, 0, 142, 1)'
        ];
        const dimColors = colors.map(c => 'rgba(255, 255, 255, 0.25)');

        // Dates labelled on the x-axis, common to all accounts.
        const graphableDates: {
            x: number,
            specialLabel: string|null
        }[] = [];

        let x = 0;
        let lastSeason: string = null;
        let lastDate: string = null;
        let lastEntry = null;
        for (const entry of graphable) {
            const {sr, playerIndex, game, connectedToNext} = entry;

            const date: string = this.formatDate(game.startTime);
            const season: string = this.gamesListService.getSeason(+game.startTime / 1000);
            if (lastDate != date){
                if (lastSeason != season) {
                    if (lastSeason) {
                        graphableDates.push({
                            x: x,
                            specialLabel: null
                        });
                        x += 6;
                    }
                    graphableDates.push({
                        x: x,
                        specialLabel: `<b>${season}</b>`
                    });
                } else {
                    graphableDates.push({
                        x: x,
                        specialLabel: null
                    });
                }
            }
            lastDate = date;
            lastSeason = season;

            const playerLastEntry = playerLastEntries[playerIndex];

            if (playerLastEntry) {
                if ("connect everything" || playerLastEntry.connectedToNext) {
                    if (playerLastEntry != lastEntry) {
                        playerLineXs[playerIndex].push(x - 1);
                        playerLineSRs[playerIndex].push(playerLastEntry.sr);
                    }
                } else {
                    playerLineXs[playerIndex].push(x);
                    playerLineSRs[playerIndex].push(null);

                    if (playerLastEntry == lastEntry) {
                        // If we're immediately following a non-connected game on the same
                        // account, insert a gap to make it clear they're separate.
                        x++;
                    }
                }
            }

            playerDotXs[playerIndex].push(x);
            playerDotSRs[playerIndex].push(sr);
            playerDotGames[playerIndex].push(game);
            playerDotLabels[playerIndex].push(this.formatLabel(game));

            if ((playerLastEntry && ("connect everything" || playerLastEntry.connectedToNext)) || ("connect everything" || connectedToNext)) {
                playerLineXs[playerIndex].push(x);
                allXs.push(x);
                playerLineSRs[playerIndex].push(sr);
            }

            x++;
            playerLastEntries[playerIndex] = entry;
            lastEntry = entry;
        }

        for (let i = players.length - 1; i >= 0; i--) {
            const playerLastEntry = playerLastEntries[i];
            playerLineXs[i].push(x + 8);
            playerLineSRs[i].push(playerLastEntry.sr);
        }

        graphableDates.push({
            x: x,
            specialLabel: null
        });

        const xAxisText: string[] = [];
        const xAxisPoints: number[] = [];

        const removeableDates = graphableDates.filter(d => d.specialLabel == null);
        const unremoveableDates = graphableDates.length - removeableDates.length;

        for (const g of graphableDates) {
            xAxisPoints.push(g.x);
            xAxisText.push(g.specialLabel || '');
        }

        // List of data series for Plotly.
        const data: any[] = [];

        // We need to specify the series in the order we want them drawn:
        // lines under dots, then least-recent accounts under more-recent.
        let colorIndex = 0;
        for (let i = players.length - 1; i >= 0; i--) {
            if (playerLineXs[i].length < 2){
                continue;
            }
            const color = colors[colorIndex++ % colors.length];
            data.push({
                showlegend: false,
                name: players[i],
                legendgroup: players[i],
                x: playerLineXs[i],
                y: playerLineSRs[i],
                mode: 'lines',
                hoverinfo: 'skip',
                line: {
                    width: 2,
                    color: color,
                }
            });
        }

        colorIndex = 0;
        for (let i = players.length - 1; i >= 0; i--) {
            if (playerLineXs[i].length < 2){
                continue;
            }
            const color = colors[colorIndex % colors.length];
            const dimColor = dimColors[colorIndex % dimColors.length];
            colorIndex++;

            data.push({
                name: players[i],
                legendgroup: players[i],
                x: playerDotXs[i],
                y: playerDotSRs[i],
                overtrackGames: playerDotGames[i],
                text: playerDotLabels[i],
                mode: 'markers',
                hoverinfo: 'y+text',
                marker: {
                    size: 6,
                    color: playerDotGames[i].map(game => game.endSR ? color : dimColor)
                }
            });
            
        }

        // We should probably reference this element in a more Angular way.
        const plotEl = document.getElementById('sr-graph');

        // set the initial zoom to include the last 100 games
        let intitialLeft = allXs[Math.max(allXs.length - 100, 0)] - 0.5;
        let initialRight = allXs[allXs.length - 1] + 1;

        const layout = {
            title: '',
            font: {
                color: 'rgb(150, 150, 150)'
            },
            hovermode: 'closest',
            dragmode: 'pan',
            xaxis: {
                title: '',
                
                tickmode: 'array',
                ticktext: xAxisText,
                tickvals: xAxisPoints,

                ticks: '',
                showgrid: true,
                zeroline: false,

                fixedrange: false,
                range: [intitialLeft, initialRight],

                gridcolor: 'rgba(0, 0, 0, 0.15)',

                align: 'left'
            },
            yaxis: {
                fixedrange: true,
                dtick: 250,
                side: 'right',
                
                gridcolor: 'rgba(255, 255, 255, 0.15)',
                gridwidth: 2
            },
            overlaying: false,
            margin: {
                l: 10,
                r: 40,
                b: 70,
                t: 5
            },
            showlegend: players.length > 1,
            legend: {
                y: 100,
                x: 0,
                orientation: 'h'
            },
            plot_bgcolor: 'rgba(0, 0, 0, 0)',
            paper_bgcolor: 'rgba(0, 0, 0, 0)',
        };

        const config = {
            displayModeBar: false,
            staticPlot: false,
            doubleClick: false,
            showTips: false,
            showAxisDragHandles: false,
            showAxisRangeEntryBoxes: false,
            displaylogo: false,
            scrollZoom: true
        };

        Plotly.newPlot(plotEl, data, layout, config);
        
        (plotEl as any).on('plotly_hover', data => {
            if (data.points.length != 1) {
                return;
            }
            if (!data.points[0].data.overtrackGames) {
                return;
            }

            const color = data.points[0].data.marker.color;

            const game:Game = data.points[0].data.overtrackGames[data.points[0].pointNumber];
            
            const label = plotEl.querySelector('g.hovertext') as SVGGElement;
            
            if (label) {
                for (const el of Array.from(label.childNodes)) {
                    // (el as any).style.display = 'none';
                }

                console.log(game.heroes);
                let html = (label.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'foreignObject') as any) as SVGForeignObjectElement;
                html.setAttribute('x', '0');
                html.setAttribute('y', '-100');
                html.setAttribute('width', '512');
                html.setAttribute('height', '512');
                html.innerHTML = HTML.string`<body xmlns="http://www.w3.org/1999/xhtml">
                    <div class="game-hover" style="color: ${color}">
                        <div class="heading">${game.result} on ${game.map}</div>
                        ${game.heroes.slice(0, 3).map(hero => HTML`<div class="played">
                            ${Math.floor(hero.percentagePlayed * 100)}% <img src="/assets/images/heroes/${hero.name}.png" />
                        </div>`)}
                    </div>
                </body>`;
                
                label.appendChild(html);
                console.log(html);
            }
        });

        (plotEl as any).on('plotly_click', data => {
            if (data.points.length != 1) {
                return;
            }
            if (!data.points[0].data.overtrackGames) {
                return;
            }
            const game:Game = data.points[0].data.overtrackGames[data.points[0].pointNumber];
            if (!game.viewable) {
                return;
            }
            if (data.event.ctrlKey){
                window.open('./game/' + game.key);
            } else {
                this.router.navigate(['/game/' + game.key]);
            }
        });

        const minLeft = -1;
        const maxRight = initialRight;
        const maxRange = maxRight - minLeft;
        (plotEl as any).on('plotly_relayout', eventdata => {  

            // prevent the user panning/zooming outside the range of games played
            let eventSource = 'user';
            if (eventdata['source']){
                eventSource = eventdata['source'];
            }

            let left: number = eventdata['xaxis.range[0]'];
            let right: number = eventdata['xaxis.range[1]'];
            if (right != undefined && left != undefined){
                let range = right - left;

                if (range > maxRange) {
                    const excess = range - maxRange;
                    range = maxRange;
                    left += excess / 2;
                    right -= excess / 2;
                }

                if (left < minLeft) {
                    left = minLeft;
                    right = left + range;
                } else if (right > maxRight) {
                    right = maxRight;
                    left = right - range;
                }

                if (eventSource == 'user'){
                    Plotly.relayout(plotEl, {
                        'source': 'constrainZoom',
                        'xaxis.range[0]': left,
                        'xaxis.range[1]': right,
                    });
                }
            }
        });
    }
}
