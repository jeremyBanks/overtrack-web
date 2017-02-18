import { Component, OnInit, Inject } from '@angular/core';
import { DOCUMENT } from '@angular/platform-browser';

import { UserLoginService, User } from './user-login.service.js';

@Component({
    selector: 'user-login',
    templateUrl: 'login/user-login.component.html',
    providers: [UserLoginService]
})
export class UserLoginComponent implements OnInit {
    loginUrl: string;
    currentUser: User;

    constructor(private userLoginService: UserLoginService, @Inject(DOCUMENT) private document: any) { }

    ngOnInit(): void {
        this.userLoginService.getUser().subscribe(
            res => {
                this.currentUser = this.userLoginService.toUser(res);
            },
            err => {
                this.loginUrl = this.userLoginService.toAuthUrl(err) + this.document.location.href;
                this.currentUser = null;
            }
        );
    }
}