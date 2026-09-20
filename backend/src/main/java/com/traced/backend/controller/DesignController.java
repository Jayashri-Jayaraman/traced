package com.traced.backend.controller;

import com.traced.backend.dto.DesignResponse;
import com.traced.backend.dto.DesignSaveRequest;
import com.traced.backend.dto.DesignSummaryResponse;
import com.traced.backend.service.DesignService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/designs")
public class DesignController {

    private final DesignService designService;

    public DesignController(DesignService designService) {
        this.designService = designService;
    }

    @GetMapping
    public List<DesignSummaryResponse> list(Authentication authentication) {
        return designService.listMine(authentication.getName());
    }

    @GetMapping("/{id}")
    public DesignResponse get(Authentication authentication, @PathVariable Long id) {
        return designService.get(authentication.getName(), id);
    }

    @PostMapping
    public ResponseEntity<DesignResponse> create(Authentication authentication, @Valid @RequestBody DesignSaveRequest request) {
        return ResponseEntity.ok(designService.create(authentication.getName(), request));
    }

    @PutMapping("/{id}")
    public DesignResponse update(Authentication authentication, @PathVariable Long id, @Valid @RequestBody DesignSaveRequest request) {
        return designService.update(authentication.getName(), id, request);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(Authentication authentication, @PathVariable Long id) {
        designService.delete(authentication.getName(), id);
        return ResponseEntity.noContent().build();
    }
}
