+++
date = "2020-09-14"
title = "Reactive testing with Gherkin, ReactiveX and asyncio"
type = "post"
categories = ["Development", "Python"]
tags = ["python"]
+++

Have you ever written integration test with asynchronous behavior? I have, and it has always been a struggle... CI/CD pipelines which regularly fail because of some timeout. Then, "a wild project manager appears!", and starts asking questions why investigating takes so long...

> Solution: The timeout is increased to quickly solve the issue, when usually the failure is caused by regression.

There must be some more elegant way to assert or await asynchronous calls in Behavior Driven Development (BDD) steps.

I am excited, enjoy what's coming next! I developed a more comfortable way to add asynchronous assertions in integration tests without adding `time.sleep(n)`.

TLDR;
This post is about practical use of combining RxPy, pytest, Gherkin, asyncio with automated testing using Python and not an introduction of the previously described libraries. Regardless of using Python I believe this test strategy can be reused with any other programming language supported by ReactiveX. The application sources can be found on [Github](https://github.com/ovaar/reactive-testing).

Let's break it down, but before I do I would like to set the scene for the demo application with the following use case.

> Use case: I have a central lighting system where lights can connect to and as a user I want to be able to turn on and off the lights.

To only focus on the testing part, we will abstract the lighting hardware using a simulator and assume the lights are able to communicate via the MQTT protocol. Let's begin with looking at how the Gherkin test Feature is described which will be used in order to execute the test.

```gherkin
# lighting\integration_tests\tests\features\lighting.feature
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

The test consists of three stage. In some way it like a Unit Test it uses Arrange / Act / Assert (AAA). In the first stage an object is build containing the initial stage for the simulator as well as setting up the the ReactiveX Observables in order to receive new states via a Mqtt Client. The ReactiveX Observables you could compare to adding a `spy` to a method in order to check if it was called. This must be done before executing the test so that we will not miss any events.

The second stage adds Lightbulb Simulators to the `TestContext` and connects them to the MQTT broker. The simulator publishes the topic `lights/connect/$lightId` to register itself with the `core` module. Then the connected lights can be controlled by sending an MQTT message to topic `lights/function/on` or `lights/function/off`. The `core` will publish an individual topic for each simulated Lightbulb. Below you see the `Lightbulb` data holder class. In order to understand the last BDD step `And I await the result` I have to first explain about how `rx.subject` works.

```python
# lighting\integration_tests\tests\data.py
from typing import Dict, Optional
import rx.subject as RxSubject


class Lightbulb(object):
    uuid: str
    state: Optional[str] = None
    light_state: RxSubject.Subject

    def __init__(self, uuid: str):
        self.uuid = uuid
        self.light_state = RxSubject.Subject()

    def complete(self):
        self.light_state.on_completed()
```

The class `rx.Subject` inherits from `rx.core.Observable` and `rx.core.Observer`. The class `rx.Subject` allows you to push data into the Rx Operators using the `rx.core.Observable` interface. When a new state is received via the topic: `lights/{lightbulbId/state`, then the `light_state.on_next(...)` is called which pipes the data to the `rx.operators`. ReactiveX operators are basically predicate functions which will evaluate the observable state with every element added to the sequence. I use [rx.operators.take_while](http://reactivex.io/documentation/operators/takewhile.html) to evaluate if the state of the lightbulb equals the expected `light_final_state`. The `take_while` Operator will automatically call on_complete if predicate function returns `False`.

```python
# lighting\integration_tests\tests\steps\lights.py
import rx.operators as RxOp
from rx import Observable as RxObservable
from rx.scheduler.eventloop import AsyncIOScheduler

@given('I expect the final state of light <light_id> to be <light_final_state>')
def light_state_equals(light_id: str,
                       light_final_state: str,
                       test_context: Data.TestContext,
                       loop: asyncio.AbstractEventLoop,
                       awaitables: List[RxObservable]):
    assert isinstance(light_id, str)
    assert isinstance(light_final_state, str)

    def take_while_state(payload: Structs.s_lights_state) -> bool:
        return payload.newState != light_final_state

    timeout_sec = 10.0
    # Get the lightbulb by id from the test context fixture
    lightbulb: Data.Lightbulb = test_context.lightbulbs[light_id]

	# Rx .pipe returns a new observable
    observable: RxObservable = lightbulb.light_state.pipe(
    	# Add a default timeout for the test to fail if no data is received
        RxOp.timeout(timeout_sec),
        # Add the AsyncIOScheduler to be able to asynchronously re-evaluate
    	# the state of the RxObserable for changes
        RxOp.observe_on(scheduler=AsyncIOScheduler(loop)),
        # Add data to the RxObservable sequence while the predicate function
    	# returns True. If it returns False the RxObservable is automatically
    	# completed and it includes the last result.
        RxOp.take_while(take_while_state, inclusive=True),
    )

    observable.subscribe(
        on_next=lambda i: print(f"on_next: {i}"),
        on_error=lambda e: print(f"on_error: {e}"),
        on_completed=lambda: print("on_completed"),
        scheduler=AsyncIOScheduler(loop)
    )

    awaitables.append(observable)
```

Finally, the last step `And I await the result` from the file `lighting.feature` uses Asyncio to asynchronously await the ReactiveX Observables which were added to the `awaitables` list. The [asyncio.gather](https://docs.python.org/3/library/asyncio-task.html#asyncio.gather) function will await for all results to be completed. Wrapping the `asyncio.gather` in a `main` function and executing it on the asyncio event loop using `loop.run_until_complete(main())` will block until all have been completed successfully or an exception is thrown.

```python
# lighting\integration_tests\tests\steps\lights.py
@then('I await the result')
def await_the_result(awaitables: List[RxObservable], loop: asyncio.AbstractEventLoop):
    if len(awaitables) == 0:
        print('Nothing to await, continuing... ')
        return

    print(f'Awaiting tasks, count={len(awaitables)}')

    async def main():
        await asyncio.gather(*awaitables)

    try:
        print('start: run_until_complete')
        loop.run_until_complete(main())
        awaitables.clear()
    except:
        awaitables.clear()
        raise
```

That is all! I hope I inspired you or gave you some insight in how to approach asynchronous assertions in testing software. For the ones who are curious about the test output, have a look below.

```
lighting-integration-tests_1  | ============================= test session starts ==============================
lighting-integration-tests_1  | platform linux -- Python 3.8.2, pytest-6.0.1, py-1.9.0, pluggy-0.13.1 -- /usr/bin/python3
lighting-integration-tests_1  | cachedir: .pytest_cache
lighting-integration-tests_1  | rootdir: /lighting/integration_tests
lighting-integration-tests_1  | plugins: bdd-3.3.0
lighting-integration-tests_1  | collecting ... collected 2 items
lighting-integration-tests_1  |
lighting-integration-tests_1  | tests/main.py::test_turn_on_the_lights[lightbulb-1-OFF-on-ON] pytest::before <Function test_turn_on_the_lights[lightbulb-1-OFF-on-ON]>
lighting-integration-tests_1  | Scenario::before: The lights are controlled
lighting-integration-tests_1  | create: loop
lighting-integration-tests_1  | create: awaitables
lighting-integration-tests_1  | PASSED Step: I have a light with the id <light_id>
lighting-integration-tests_1  | PASSED Step: the light <light_id> is turned <light_begin_state>ReactiveListener::on_connect Connected with result code 0
lighting-integration-tests_1  |
lighting-integration-tests_1  | PASSED Step: I expect the final state of light <light_id> to be <light_final_state>
lighting-integration-tests_1  | create: simulator
lighting-integration-tests_1  | LightbulbSimulator::connect_as lightbulb-1 to localhost:1883
lighting-integration-tests_1  | LightbulbSimulator::on_connect Lightbulb=lightbulb-1 connected
lighting-integration-tests_1  | LightbulbSimulator::on_message topic=lights/lightbulb-1/state/get payload=b''
lighting-integration-tests_1  | LightbulbSimulator::on_message public topic=lights/lightbulb-1/state payload=s_lights_state(newState='OFF')
lighting-integration-tests_1  | ReactiveListener::on_message topic=lights/lightbulb-1/state payload=b'{"newState": "OFF"}'
lighting-integration-tests_1  | on_next: s_lights_state(newState='OFF')
lighting-integration-tests_1  | PASSED Step: the lights are connected
lighting-integration-tests_1  | PASSED Step: I use <light_function> to control the lights
lighting-integration-tests_1  | Awaiting tasks, count=1
lighting-integration-tests_1  | start: run_until_complete
lighting-integration-tests_1  | LightbulbSimulator::on_message topic=lights/lightbulb-1/function/on payload=b''
lighting-integration-tests_1  | LightbulbSimulator::on_message public topic=lights/lightbulb-1/state payload=s_lights_state(newState='ON')
lighting-integration-tests_1  | ReactiveListener::on_message topic=lights/lightbulb-1/state payload=b'{"newState": "ON"}'
lighting-integration-tests_1  | on_next: s_lights_state(newState='ON')
lighting-integration-tests_1  | on_completed
lighting-integration-tests_1  | PASSED Step: I await the result
lighting-integration-tests_1  | PASSEDpytest::after <Function test_turn_on_the_lights[lightbulb-1-OFF-on-ON]>
lighting-integration-tests_1  | after: awaitables
lighting-integration-tests_1  |
lighting-integration-tests_1  | tests/main.py::test_turn_on_the_lights[lightbulb-2-ON-off-OFF] pytest::before <Function test_turn_on_the_lights[lightbulb-2-ON-off-OFF]>
lighting-integration-tests_1  | Scenario::before: The lights are controlled
lighting-integration-tests_1  | create: awaitables
lighting-integration-tests_1  | PASSED Step: I have a light with the id <light_id>
lighting-integration-tests_1  | PASSED Step: the light <light_id> is turned <light_begin_state>
lighting-integration-tests_1  | PASSED Step: I expect the final state of light <light_id> to be <light_final_state>
lighting-integration-tests_1  | create: simulator
lighting-integration-tests_1  | LightbulbSimulator::connect_as lightbulb-2 to localhost:1883
lighting-integration-tests_1  | LightbulbSimulator::on_connect Lightbulb=lightbulb-2 connected
lighting-integration-tests_1  | LightbulbSimulator::on_message topic=lights/lightbulb-2/state/get payload=b''
lighting-integration-tests_1  | LightbulbSimulator::on_message public topic=lights/lightbulb-2/state payload=s_lights_state(newState='ON')
lighting-integration-tests_1  | ReactiveListener::on_message topic=lights/lightbulb-2/state payload=b'{"newState": "ON"}'
lighting-integration-tests_1  | on_next: s_lights_state(newState='ON')
lighting-integration-tests_1  | PASSED Step: the lights are connected
lighting-integration-tests_1  | PASSED Step: I use <light_function> to control the lights
lighting-integration-tests_1  | Awaiting tasks, count=1
lighting-integration-tests_1  | start: run_until_complete
lighting-integration-tests_1  | LightbulbSimulator::on_message topic=lights/lightbulb-2/function/off payload=b''
lighting-integration-tests_1  | LightbulbSimulator::on_message public topic=lights/lightbulb-2/state payload=s_lights_state(newState='OFF')
lighting-integration-tests_1  | ReactiveListener::on_message topic=lights/lightbulb-2/state payload=b'{"newState": "OFF"}'
lighting-integration-tests_1  | on_next: s_lights_state(newState='OFF')
lighting-integration-tests_1  | on_completed
lighting-integration-tests_1  | PASSED Step: I await the result
lighting-integration-tests_1  | PASSEDpytest::after <Function test_turn_on_the_lights[lightbulb-2-ON-off-OFF]>
lighting-integration-tests_1  | after: awaitables
lighting-integration-tests_1  | exit: loop
lighting-integration-tests_1  |
lighting-integration-tests_1  |
lighting-integration-tests_1  | ============================== 2 passed in 22.08s ==============================
reactive-testing_lighting-integration-tests_1 exited with code 0
```
