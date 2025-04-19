import { Component, OnInit, HostListener, ElementRef } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { UserInfo } from 'ptcg-server';
import { Observable, interval } from 'rxjs';
import { Router } from '@angular/router';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { switchMap, filter, take } from 'rxjs/operators';

import { AlertService } from './shared/alert/alert.service';
import { LoginRememberService } from './login/login-remember.service';
import { LoginService } from './api/services/login.service';
import { SessionService } from './shared/session/session.service';
import { SocketService } from './api/socket.service';
import { TranslateService } from '@ngx-translate/core';
import { environment } from '../environments/environment';

@UntilDestroy()
@Component({
  selector: 'ptcg-app',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {

  public isLoggedIn = false;
  public loggedUser: UserInfo | undefined;
  private authToken$: Observable<string>;
  // private readonly MAX_RECONNECT_ATTEMPTS = 3;
  // private reconnectAttempts = 0;

  constructor(
    private alertService: AlertService,
    private dialog: MatDialog,
    private elementRef: ElementRef<HTMLElement>,
    private loginService: LoginService,
    private loginRememberService: LoginRememberService,
    private router: Router,
    private sessionService: SessionService,
    private socketService: SocketService,
    private translate: TranslateService
  ) {
    this.authToken$ = this.sessionService.get(session => session.authToken);
    setTimeout(() => this.onResize());
  }

  public ngOnInit() {
    this.authToken$
      .pipe(untilDestroyed(this))
      .subscribe(authToken => {
        this.isLoggedIn = !!authToken;
        if (this.isLoggedIn && !this.socketService.isEnabled) {
          this.socketService.enable(authToken);
        }
        if (!this.isLoggedIn && this.socketService.isEnabled) {
          this.socketService.disable();
        }
      });

    this.socketService.connection.pipe(
      untilDestroyed(this)
    ).subscribe({
      next: async connected => {
        if (!connected && this.isLoggedIn) {
          console.log('[Client Disconnect] Socket connection lost while logged in');
          this.socketService.disable();
          this.dialog.closeAll();
          await this.alertService.alert(this.translate.instant('ERROR_DISCONNECTED_FROM_SERVER'));
          this.sessionService.clear();
          this.router.navigate(['/login']);
        } else if (connected) {
          console.log('[Client Connect] Socket connection established');
        }
      }
    });

    document.addEventListener('visibilitychange', () => {
      console.log('[Visibility Change] Document visibility:', document.visibilityState);
      if (document.visibilityState === 'visible' && this.isLoggedIn && !this.socketService.isEnabled) {
        console.log('[Visibility Change] Attempting to reconnect socket');
        this.authToken$.pipe(take(1)).subscribe(authToken => {
          this.socketService.enable(authToken);
        });
      }
    });

    interval(environment.refreshTokenInterval).pipe(
      untilDestroyed(this),
      filter(() => !!this.sessionService.session.authToken),
      switchMap(() => this.loginService.refreshToken())
    ).subscribe({
      next: response => {
        this.sessionService.session.authToken = response.token;
        if (this.loginRememberService.token) {
          this.loginRememberService.rememberToken(response.token);
        }
      }
    });
  }

  public ngOnDestroy() {
    document.removeEventListener('visibilitychange', () => { });
  }

  @HostListener('window:resize', ['$event'])
  onResize(event?: Event) {
    const element = this.elementRef.nativeElement;
    const toolbarHeight = 64;
    const contentHeight = element.offsetHeight - toolbarHeight;
    const cardAspectRatio = 1.37;
    const padding = 32;
    const cardHeight = (contentHeight - (padding * 5)) / 7;
    let cardSize = Math.floor(cardHeight / cardAspectRatio);
    cardSize = Math.min(Math.max(cardSize, 60), 60);
    element.style.setProperty('--card-size', cardSize + 'px');
  }

  @HostListener('window:beforeunload', ['$event'])
  beforeUnloadHandler(event: BeforeUnloadEvent) {
    // Check if user is in an active game
    const activeGames = this.sessionService.session.gameStates?.filter(g => !g.deleted && !g.gameOver);

    if (activeGames && activeGames.length > 0) {
      // Show a warning
      const message = this.translate.instant('WARNING_ACTIVE_GAMES');
      event.preventDefault();
      event.returnValue = message;
      return message;
    }
  }
}