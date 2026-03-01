package org.acme.monitoring;

import io.quarkus.test.junit.QuarkusTest;
import jakarta.inject.Inject;
import org.junit.jupiter.api.Test;

import static io.restassured.RestAssured.given;
import static org.junit.jupiter.api.Assertions.assertTrue;

@QuarkusTest
public class MetricsCollectorJobTest {

    @Inject
    MetricsCollectorJob collectorJob;

    @Inject
    MetricsStore store;

    @Test
    public void testMetricsCollection() throws Exception {
        // Trigger a request to generate HTTP metric
        given()
                .when().get("/ssr")
                .then().statusCode(200);

        // Run collector job manually
        collectorJob.collect();

        // Validate that metrics snapshot is correctly captured
        var snapshots = store.getAll();
        assertTrue(snapshots.size() > 0, "Snapshot list is empty");

        var latest = snapshots.get(snapshots.size() - 1);
        System.out.println("LATEST SNAPSHOT: " + latest);

        // Give that we queried /ssr, httpReads should be >= 1
        assertTrue(latest.httpReads() >= 1, "HTTP Reads should be >= 1");
    }
}
