import { GameMessage, State, StateUtils, StoreLike, TrainerCard, TrainerType } from '../../game';
import { Effect } from '../../game/store/effects/effect';
import { TrainerEffect } from '../../game/store/effects/play-card-effects';
import { LOOK_AT_TOPDECK_AND_DISCARD_OR_RETURN, SELECT_PROMPT_WITH_OPTIONS } from '../../game/store/prefabs/prefabs';

export class TrickShovel extends TrainerCard {

  public trainerType: TrainerType = TrainerType.ITEM;
  public set: string = 'FLF';
  public cardImage: string = 'assets/cardback.png';
  public setNumber: string = '98';
  public name: string = 'Trick Shovel';
  public fullName: string = 'Trick Shovel FLF';
  public text: string = 'Look at the top card of either player\'s deck. You may discard that card or return it to the top of the deck.';


  public reduceEffect(store: StoreLike, state: State, effect: Effect): State {

    if (effect instanceof TrainerEffect && effect.trainerCard === this) {
      const player = effect.player;
      const opponent = StateUtils.getOpponent(state, player);

      effect.preventDefault = true;
      player.hand.moveCardTo(effect.trainerCard, player.supporter);

      SELECT_PROMPT_WITH_OPTIONS(store, state, player, GameMessage.CHOOSE_OPTION, [{
        message: GameMessage.REVEAL_YOUR_TOP_DECK,
        action: () => LOOK_AT_TOPDECK_AND_DISCARD_OR_RETURN(store, state, player, player),
      },
      {
        message: GameMessage.REVEAL_OPPONENT_TOP_DECK,
        action: () => LOOK_AT_TOPDECK_AND_DISCARD_OR_RETURN(store, state, player, opponent),
      }]);

      player.supporter.moveCardTo(this, player.discard);
    }

    return state;
  }

}