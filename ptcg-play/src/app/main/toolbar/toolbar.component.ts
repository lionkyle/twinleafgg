import { Component, OnInit, Output, EventEmitter } from '@angular/core';
import { Observable } from 'rxjs';
import { Router } from '@angular/router';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { GameState, UserInfo } from 'ptcg-server';
import { map } from 'rxjs/operators';

import { LoginRememberService } from '../../login/login-remember.service';
import { SessionService } from '../../shared/session/session.service';
import { environment } from '../../../environments/environment';

import { MatDialog } from '@angular/material/dialog';
import { SettingsDialogComponent } from '../../table/table-sidebar/settings-dialog/settings-dialog.component';

@UntilDestroy()
@Component({
  selector: 'ptcg-toolbar',
  templateUrl: './toolbar.component.html',
  styleUrls: ['./toolbar.component.scss']
})
export class ToolbarComponent implements OnInit {

  @Output() logoClick = new EventEmitter<void>();

  private loggedUser$: Observable<UserInfo | undefined>;
  public loggedUser: UserInfo | undefined;
  public gameStates$: Observable<GameState[]>;
  public unreadMessages$: Observable<number>;

  apiUrl = environment.apiUrl;

  constructor(
    private loginRememberService: LoginRememberService,
    private router: Router,
    private sessionService: SessionService,
    private dialog: MatDialog
  ) {
    this.gameStates$ = this.sessionService.get(session => session.gameStates).pipe(
      map(gameStates => gameStates.slice(0, 1))
    );

    this.unreadMessages$ = this.sessionService.get(session => {
      let unread = 0;
      session.conversations.forEach(c => {
        const message = c.lastMessage;
        if (message.senderId !== session.loggedUserId && !message.isRead) {
          unread += 1;
        }
      });
      return unread;
    });

    this.loggedUser$ = this.sessionService.get(
      session => session.loggedUserId,
      session => session.users
    ).pipe(map(([loggedUserId, users]) => {
      return users[loggedUserId];
    }));
  }

  public ngOnInit() {
    this.loggedUser$
      .pipe(untilDestroyed(this))
      .subscribe(user => this.loggedUser = user);
  }

  public openSettingsDialog() {
    this.dialog.open(SettingsDialogComponent);
  }

  public login() {
    this.router.navigate(['/login'], { queryParams: { redirectUrl: this.router.url } });
  }

  public logout() {
    this.loginRememberService.rememberToken();
    this.sessionService.clear();
    this.router.navigate(['/login']);
  }

  public onLogoClick() {
    this.logoClick.emit();
  }
}
