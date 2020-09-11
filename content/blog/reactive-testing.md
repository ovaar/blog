+++
date = "2020-09-11"
title = "[Python] Reactive testing with Gherkin, ReactiveX and asyncio"
type = "post"
categories = ["Development", "Python"]
tags = ["Development", "Testing", "ReactiveX", "async"]
+++

## [Python] Reactive testing with Gherkin, ReactiveX and asyncio

Have you ever written integration test with asynchronous behavior? I have, and it has always been a struggle... CI/CD pipelines which regularly fail because of some timeout. Then, "a wild project manager appears!", and starts asking questions why investigating takes so long...

> Solution: The timeout is increased to quickly solve the issue, when usually the failure is caused by regression.

There must be some more elegant way to assert or await asynchronous calls in Behavior Driven Development (BDD) steps.

I am excited, enjoy what's coming next! I discovered a more comfortable way to add asynchronous assertions in integration tests without adding `time.sleep(n)`.

TLDR;
This post is about practical use of RxPy, pytest, Gherkin, asyncio and testing with Python and not an introduction of the previously described libraries. Regardless of using Python I believe this test strategy can be reused with any other programming language supported by ReactiveX. The application sources can be found on [Github](https://github.com/ovaar/reactive-testing)

Let's break it down, but before I do that I would like to set the scene with the following use case.

> Use case: I have a central lighting system where lights can connect to and as a user I want to be able to turn on and off the lights.

To only focus on the testing part we will abstract the lighting hardware using a simulator and assume the lights are able to communicate via the MQTT protocol. Lets begin with looking at how the Gherkin Feature is described which will be used in order to execute the test.

```gherkin
Feature: The lights must be able to be turned on and off

    Scenario: The lights are controlled
        Given I have a light with the id <light_id>
        And the light <light_id> is turned <light_begin_state>
        And I expect the final state of light <light_id> to be <light_final_state>
        When the lights are connected
        Then I use <light_function> to control the lights
        And I await the result

        Examples: Vertical
            | light_id          | lightbulb-1 | lightbulb-2 |
            | light_begin_state | OFF         | ON          |
            | light_function    | on          | off         |
            | light_final_state | ON          | OFF         |

```

The test consists of three stage. In some way it like a Unit Test it uses Arrange / Act / Assert (AAA). In the first stage an object is build containing the initial stage for the simulator aswell as setting up the the Rx Observables to listen for asynchronous events. Using the Rx Observables you could compare to adding a `spy` to a method in order to check if it was called. This must also be done in an early stage of the test so that will not miss any events.

The second stage creates the simulators and connects them to the MQTT broker. After successfully connecting the simulator publishes the `lights/connect/$lightId` to register itself with the `core` module. Then the connected lights are controlled by sending an MQTT message to topic `lights/function/on` or `lights/function/off`. The `core` will send an individual MQTT message to each simulated Lightbulb. Below you see the `Lightbulb` data holder class. In order to understand the last BDD step `And I await the result` I have to explain what the class `Observables` is.

```python
class Lightbulb(object):
    uuid: str
    state: Optional[str] = None
    observables: Observables

    def __init__(self, uuid: str, observables: Observables):
        self.uuid = uuid
        self.observables = observables
```

Each `Lightbulb` has `Observables` containing ReactiveX Subjects. The RxSubject is an observer but allows piping Rx Operators. The member `light_state` will be used to pipe newly received states from topic `lights/{lightbulbId/state` to the Rx Operators which are going to test if it has received the `light_final_state`.

```python
import rx.subject as RxSubject

class Observables(object):
    light_state: RxSubject.Subject

    def __init__(self):
        self.light_state = RxSubject.Subject()

    def complete(self):
        self.light_state.on_completed()
```

The final step `And I await the result` uses Asyncio to asynchronously await the ReactiveX Observables added to a list which were created during the Arrange stage.
Before, I mentioned that we need to pipe the newly received states to the RxSubject, so lets have a look at how that works.

```python
import rx.operators as RxOp
from rx import Observable as RxObservable
from rx.scheduler.eventloop import AsyncIOScheduler

def take_while_state(payload: Structs.s_lights_state) -> bool:
    return payload.newState != light_final_state

timeout_sec = 10.0
# Get the lightbulb by id from the test context fixture
lightbulb: Data.Lightbulb = test_context.lightbulbs[light_id]

# Rx .pipe returns a new observable
observable: RxObservable = lightbulb.observables.light_state.pipe(
	# Add a default timeout
    RxOp.timeout(timeout_sec),
    # Add the AsyncIOScheduler to be able to asynchronously re-evaluate
    # the state of the RxObserablefor changes
    RxOp.observe_on(scheduler=AsyncIOScheduler(loop)),
    # Add data to the RxObservable sequence until the predicate function
    # returns True, including the last result.
    RxOp.take_while(take_while_state, inclusive=True),
)
```
